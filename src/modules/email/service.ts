import { randomBytes, createHash } from 'node:crypto';
import { addHours } from 'date-fns';
import { getEnv } from '@/lib/env';
import * as repo from './repository';
import { EMAIL_CATEGORIES, isMarketing, type EmailCategory } from './categories';

/** Verification links are short-lived; an old link in an inbox is a liability. */
export const VERIFY_TOKEN_TTL_HOURS = 24;
/** Unsubscribe links must keep working long after the email was sent. */
export const UNSUBSCRIBE_TOKEN_TTL_HOURS = 24 * 365;

export type Message = {
  to: string;
  subject: string;
  text: string;
  category: EmailCategory;
  /** Set for any message carrying an unsubscribe affordance. */
  unsubscribeUrl?: string;
};

export type SendOutcome =
  | { sent: true }
  | { sent: false; reason: 'suppressed' | 'unsubscribed' | 'unverified' | 'no_transport' };

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/* ------------------------------------------------------------- tokens --- */

export async function createVerificationToken(userId: string): Promise<string> {
  const token = newToken();
  await repo.insertToken({
    userId,
    kind: 'verify_email',
    tokenHash: hash(token),
    category: null,
    expiresAt: addHours(new Date(), VERIFY_TOKEN_TTL_HOURS),
  });
  return token;
}

export async function redeemVerificationToken(
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string } | undefined> {
  const row = await repo.redeemToken(hash(token), 'verify_email', now);
  return row ? { userId: row.userId } : undefined;
}

export async function createUnsubscribeToken(
  userId: string,
  category: EmailCategory,
): Promise<string> {
  const token = newToken();
  await repo.insertToken({
    userId,
    kind: 'unsubscribe',
    tokenHash: hash(token),
    category,
    expiresAt: addHours(new Date(), UNSUBSCRIBE_TOKEN_TTL_HOURS),
  });
  return token;
}

export async function redeemUnsubscribeToken(
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string; category: EmailCategory } | undefined> {
  const row = await repo.redeemToken(hash(token), 'unsubscribe', now);
  if (!row?.category) return undefined;
  return { userId: row.userId, category: row.category as EmailCategory };
}

export function unsubscribeUrl(token: string): string {
  return new URL(`/unsubscribe?token=${token}`, getEnv().APP_URL).toString();
}

/* --------------------------------------------------------------- send --- */

/**
 * Decide whether a message may be sent.
 *
 * Every rule here is a hard gate applied before the transport is touched, so
 * there is no code path that reaches a provider without passing them.
 */
export async function canSend(
  userId: string,
  email: string,
  category: EmailCategory,
  emailVerifiedAt: Date | null,
): Promise<SendOutcome> {
  // A suppressed address is never mailed again, for any category including
  // essential — a hard bounce or complaint overrides everything.
  if (await repo.isSuppressed(email)) return { sent: false, reason: 'suppressed' };

  // Essential mail is exempt from preference checks, by definition.
  if (!EMAIL_CATEGORIES[category].optional) return { sent: true };

  // Marketing to an unverified address is mail to an unproven recipient.
  if (isMarketing(category) && !emailVerifiedAt) {
    return { sent: false, reason: 'unverified' };
  }

  const preference = await repo.findPreference(userId, category);
  // Absent row means never seeded; fall back to the category default rather
  // than assuming consent.
  const subscribed = preference?.subscribed ?? !isMarketing(category);

  return subscribed ? { sent: true } : { sent: false, reason: 'unsubscribed' };
}

/**
 * Headers that belong on a message.
 *
 * List-Unsubscribe plus List-Unsubscribe-Post is what lets a mail client offer
 * one-click unsubscribe (RFC 8058). Note what this does NOT do: it does not
 * give KyliX any control over Gmail's own interface. Gmail decides whether and
 * how to surface it; all a sender can do is supply a correct header and honour
 * what comes back.
 */
export function listHeaders(unsubscribe?: string): Record<string, string> {
  if (!unsubscribe) return {};
  return {
    'List-Unsubscribe': `<${unsubscribe}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export type Transport = (message: Message, headers: Record<string, string>) => Promise<void>;

/**
 * The default transport writes to the server log and sends nothing.
 *
 * No email provider is configured for this deployment and none is assumed. A
 * no-op that says so is honest; a transport that silently swallowed messages
 * while reporting success would not be.
 */
const consoleTransport: Transport = async (message, headers) => {
  console.warn(
    `[email:console] to=${message.to} category=${message.category} subject=${JSON.stringify(
      message.subject,
    )} headers=${JSON.stringify(headers)}\n${message.text}`,
  );
};

let transport: Transport | undefined;

/** Swappable so tests can assert on what would have been sent. */
export function setTransport(next: Transport | undefined): void {
  transport = next;
}

function activeTransport(): Transport | undefined {
  if (transport) return transport;
  return getEnv().EMAIL_TRANSPORT === 'console' ? consoleTransport : undefined;
}

export async function send(
  recipient: { userId: string; email: string; emailVerifiedAt: Date | null },
  message: Omit<Message, 'to'>,
): Promise<SendOutcome> {
  const gate = await canSend(
    recipient.userId,
    recipient.email,
    message.category,
    recipient.emailVerifiedAt,
  );

  if (!gate.sent) {
    await repo.insertLog({
      userId: recipient.userId,
      category: message.category,
      subject: message.subject,
      status: 'skipped',
      skipReason: gate.reason,
    });
    return gate;
  }

  const active = activeTransport();
  if (!active) {
    await repo.insertLog({
      userId: recipient.userId,
      category: message.category,
      subject: message.subject,
      status: 'skipped',
      skipReason: 'no_transport',
    });
    return { sent: false, reason: 'no_transport' };
  }

  // Optional categories always carry an unsubscribe path, not just marketing:
  // if a user can turn it off in the preference centre, the mail should say so.
  let url = message.unsubscribeUrl;
  if (!url && EMAIL_CATEGORIES[message.category].optional) {
    url = unsubscribeUrl(await createUnsubscribeToken(recipient.userId, message.category));
  }

  await active({ ...message, to: recipient.email, unsubscribeUrl: url }, listHeaders(url));

  await repo.insertLog({
    userId: recipient.userId,
    category: message.category,
    subject: message.subject,
    status: 'sent',
  });

  return { sent: true };
}

/* ------------------------------------------------------ unsubscribing --- */

export async function unsubscribeByToken(
  token: string,
  now: Date = new Date(),
): Promise<{ category: EmailCategory } | undefined> {
  const redeemed = await redeemUnsubscribeToken(token, now);
  if (!redeemed) return undefined;

  await repo.setPreference(redeemed.userId, redeemed.category, false);
  return { category: redeemed.category };
}
