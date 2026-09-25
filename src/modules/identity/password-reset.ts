import { hashPassword } from '@/lib/security/password';
import { consume, networkScope, reset, RULES } from '@/lib/security/rate-limit';
import { brand } from '@/lib/brand';
import * as email from '@/modules/email/service';
import * as repo from './repository';
import { startSessionForUser, type RequestContext } from './service';
import type { User } from './schema';
import type { CompletePasswordResetInput, RequestPasswordResetInput } from './validators';

/**
 * Password reset.
 *
 * The request half must not reveal whether an account exists. Every address
 * gets the same response, the same rate limits, and the same timing: the only
 * work that differs — looking the user up, issuing a token, calling the email
 * provider — happens after the response has gone, through `defer`. In a route
 * that is Next's `after()`; in a test it simply runs inline.
 *
 * The completion half is the dangerous one, because a valid token is the
 * account. It is single-use (redeemed atomically), short-lived, and on success
 * ends every existing session — including any an attacker might hold.
 */

/** Runs work after the response is sent. Defaults to running it inline. */
export type Defer = (work: () => Promise<void>) => unknown;

const inline: Defer = (work) => work();

export type RequestResetResult =
  | { ok: true }
  | { ok: false; error: { kind: 'unavailable' } }
  | { ok: false; error: { kind: 'rate_limited'; retryAfterSeconds: number } };

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  ctx: RequestContext,
  now: Date = new Date(),
  defer: Defer = inline,
): Promise<RequestResetResult> {
  // Refuse outright rather than accept and silently deliver nothing. The
  // answer is the same for every address, so it discloses nothing about any.
  if (!email.canDeliverToUsers()) return { ok: false, error: { kind: 'unavailable' } };

  const network = networkScope('reset', ctx.ip);
  const [ipGate, addressGate] = await Promise.all([
    consume(network.key, network.rule, now),
    consume(`reset:address:${input.email}`, RULES.resetPerAddress, now),
  ]);

  if (!ipGate.allowed || !addressGate.allowed) {
    await repo.insertAuditEntry({
      action: 'auth.password_reset.rate_limited',
      metadata: { email: input.email, scope: !ipGate.allowed ? 'network' : 'address' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      ok: false,
      error: {
        kind: 'rate_limited',
        retryAfterSeconds: Math.max(ipGate.retryAfterSeconds, addressGate.retryAfterSeconds),
      },
    };
  }

  await defer(() => issueResetEmail(input.email, ctx, now));
  return { ok: true };
}

/** The part whose duration depends on whether the account exists. */
async function issueResetEmail(address: string, ctx: RequestContext, now: Date): Promise<void> {
  try {
    const user = await repo.findUserByEmail(address);

    if (!user) {
      await repo.insertAuditEntry({
        action: 'auth.password_reset.requested',
        metadata: { email: address, outcome: 'unknown_email' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return;
    }

    const token = await email.createPasswordResetToken(user.id, now);
    const outcome = await email.send(recipient(user), {
      category: 'essential',
      subject: `Reset your ${brand.name} password`,
      text: [
        `Someone asked to reset the password for your ${brand.name} account.`,
        '',
        `If that was you, choose a new password here. The link works once and expires in ${email.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes:`,
        '',
        email.passwordResetUrl(token),
        '',
        'If it was not you, ignore this email. Your password has not changed, and nobody can change it without this link.',
      ].join('\n'),
    });

    await repo.insertAuditEntry({
      userId: user.id,
      action: 'auth.password_reset.requested',
      entityType: 'user',
      entityId: user.id,
      metadata: { outcome: outcome.sent ? 'sent' : outcome.reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  } catch (error) {
    // Deferred work has no caller left to report to. Record that it failed —
    // without the address or the link, which are what make it sensitive.
    console.error(
      'account recovery: issuing the email failed',
      error instanceof Error ? error.name : 'unknown',
    );
  }
}

export type CompleteResetResult =
  | { ok: true; user: User; token: string; expiresAt: Date }
  | { ok: false; error: { kind: 'invalid_or_expired' } };

export async function completePasswordReset(
  input: CompletePasswordResetInput,
  ctx: RequestContext,
  now: Date = new Date(),
  defer: Defer = inline,
): Promise<CompleteResetResult> {
  // Atomic: of two simultaneous submissions of the same link, one wins.
  const redeemed = await email.redeemPasswordResetToken(input.token, now);
  const user = redeemed ? await repo.findUserById(redeemed.userId) : undefined;

  if (!user) {
    await repo.insertAuditEntry({
      action: 'auth.password_reset.rejected',
      metadata: { reason: 'invalid_or_expired' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: false, error: { kind: 'invalid_or_expired' } };
  }

  await repo.setPasswordHash(user.id, await hashPassword(input.password), now);

  // Every session ends, not just "other" ones: the person resetting is by
  // definition not signed in here, and a session they did not start — the
  // reason people reset passwords — must not survive it.
  await repo.deleteSessionsForUser(user.id);

  // A lockout from failed sign-ins is exactly what sends people here.
  await reset(`signin:account:${user.email.toLowerCase()}`);

  const session = await startSessionForUser(user, ctx, now);

  await repo.insertAuditEntry({
    userId: user.id,
    action: 'auth.password_reset.completed',
    entityType: 'user',
    entityId: user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  // A change the owner did not make is the one they most need to hear about.
  await defer(async () => {
    try {
      await email.send(recipient(user), {
        category: 'essential',
        subject: `Your ${brand.name} password was changed`,
        text: [
          `The password for your ${brand.name} account was just changed, and every device that was signed in has been signed out.`,
          '',
          'If this was you, there is nothing else to do.',
          '',
          'If it was not, someone had access to your email. Secure your email account first, then reset your password again.',
        ].join('\n'),
      });
    } catch (error) {
      console.error(
        'account recovery: change notice failed',
        error instanceof Error ? error.name : 'unknown',
      );
    }
  });

  return { ok: true, user, token: session.token, expiresAt: session.expiresAt };
}

/** Whether a link is still usable, for the page to say so before a form is filled. */
export function isResetLinkLive(token: string, now: Date = new Date()): Promise<boolean> {
  return email.isPasswordResetTokenLive(token, now);
}

function recipient(user: User) {
  return { userId: user.id, email: user.email, emailVerifiedAt: user.emailVerifiedAt };
}
