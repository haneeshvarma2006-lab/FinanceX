import type { GoogleIdentity } from './oauth';
import type { User } from './schema';
import * as repo from './repository';

/**
 * Account linking and duplicate prevention.
 *
 * The rules, and why each exists:
 *
 * 1. A provider subject already linked wins outright. `sub` is Google's stable
 *    identifier; matching on it first means a user who changed their Gmail
 *    address still lands in their own account instead of creating a new one.
 *
 * 2. Auto-linking to an existing local account requires proof on BOTH sides:
 *    `email_verified` from the provider AND `emailVerifiedAt` on the local
 *    account. Checking only the provider defends one direction and leaves the
 *    other wide open — this is the pre-account-linking attack:
 *
 *      An attacker signs up locally with victim@example.com and a password
 *      only they know. Nothing proves they own that address. The victim later
 *      clicks "Continue with Google", Google correctly asserts the address is
 *      theirs, and a provider-only check would hand the victim's Google
 *      identity straight to the attacker's account — then sign the victim into
 *      it, where everything they record is readable by the attacker.
 *
 *    So an unverified local account is never auto-linked. Because this build
 *    has no email provider and therefore cannot verify a local address at all,
 *    that path currently always refuses — which is the correct behaviour, not
 *    a gap. The user signs in with their password and links from Settings,
 *    which proves control of the account directly.
 *
 * 3. An unverified provider email never links and never registers. It is a
 *    dead end by design, not an oversight.
 *
 * 4. A new account from Google still has to pass the age gate, so the OAuth
 *    path cannot be used to skip onboarding.
 */

export type LinkOutcome =
  | { kind: 'existing_link'; user: User }
  | { kind: 'linked_to_local'; user: User }
  | { kind: 'needs_registration'; identity: GoogleIdentity }
  | {
      kind: 'refused';
      reason: 'email_unverified' | 'already_linked_elsewhere' | 'local_account_unverified';
    };

export async function resolveGoogleIdentity(
  identity: GoogleIdentity,
  signedInUser?: User,
): Promise<LinkOutcome> {
  const existing = await repo.findOAuthAccount('google', identity.subject);

  // Rule 1 — a known subject always resolves to its own account.
  if (existing) {
    if (signedInUser && existing.userId !== signedInUser.id) {
      // This Google account belongs to somebody else; linking it here would
      // give two KyliX accounts a claim on one identity.
      return { kind: 'refused', reason: 'already_linked_elsewhere' };
    }

    const user = await repo.findUserById(existing.userId);
    if (!user) return { kind: 'needs_registration', identity };

    await repo.touchOAuthAccount(existing.id);
    return { kind: 'existing_link', user };
  }

  // Rule 3 — an unverified provider email is never trusted for identity.
  if (!identity.emailVerified) {
    return { kind: 'refused', reason: 'email_unverified' };
  }

  // Linking into the account the user is currently signed in to.
  if (signedInUser) {
    await repo.insertOAuthAccount({
      userId: signedInUser.id,
      provider: 'google',
      subject: identity.subject,
      providerEmail: identity.email,
    });
    return { kind: 'linked_to_local', user: signedInUser };
  }

  // Rule 2 — auto-link only when BOTH sides are proven.
  const local = await repo.findUserByEmail(identity.email);
  if (local) {
    if (!local.emailVerifiedAt) {
      /**
       * The local account claims this address but has never proven it. Linking
       * here would be the takeover described above, so the user is sent to
       * sign in with their password instead — which proves control of the
       * account itself rather than of the address.
       */
      return { kind: 'refused', reason: 'local_account_unverified' };
    }

    await repo.insertOAuthAccount({
      userId: local.id,
      provider: 'google',
      subject: identity.subject,
      providerEmail: identity.email,
    });

    return { kind: 'linked_to_local', user: local };
  }

  // Rule 4 — a brand new person still has to pass the age gate first.
  return { kind: 'needs_registration', identity };
}

/**
 * Refuse to remove the last way into an account.
 *
 * Unlinking the only Google account from a user who has no usable password
 * would lock them out permanently, so the check is here rather than in the UI,
 * where it could be bypassed by posting the form directly.
 */
export async function canUnlink(user: User, accountId: string): Promise<boolean> {
  const linked = await repo.listOAuthAccountsForUser(user.id);
  if (!linked.some((a) => a.id === accountId)) return false;

  const hasPassword = user.passwordHash !== repo.NO_PASSWORD;
  return hasPassword || linked.length > 1;
}
