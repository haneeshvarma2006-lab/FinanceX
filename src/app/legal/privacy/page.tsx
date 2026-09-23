import type { Metadata } from 'next';
import { brand } from '@/lib/brand';

export const metadata: Metadata = { title: 'Privacy notice' };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Privacy notice</h1>
      <p className="numeric text-xs text-text-muted">Version 2026-09-20 · Draft</p>

      <p>
        <strong>This is a draft, not reviewed by a lawyer.</strong> It accurately describes what the
        software does today. It has not been assessed against the DPDP Act, the GDPR, or any other
        regime, and no such compliance is claimed.
      </p>

      <h2>What is collected</h2>
      <ul>
        <li>Your name, email address, time zone and base currency.</li>
        <li>
          Your date of birth, used for the age check at sign-up. It is stored on your account and is
          not shared with anyone.
        </li>
        <li>
          A password, stored only as an argon2id hash. The original is never written down and cannot
          be recovered from the hash.
        </li>
        <li>
          Everything you enter: accounts, transactions, budgets, subscriptions, trades, executions
          and notes.
        </li>
        <li>
          A security log of sign-ins, sign-outs, failed attempts and account changes, including IP
          address and browser, so you can see access you did not expect.
        </li>
        <li>A record of what you consented to, when, and which version you agreed to.</li>
      </ul>

      <h2>What is not collected</h2>
      <ul>
        <li>
          No bank, card or brokerage credentials. {brand.name} connects to no financial institution
          and has no mechanism to do so.
        </li>
        <li>No government identity documents. None are requested and none are accepted.</li>
        <li>No analytics, advertising or third-party tracking.</li>
        <li>No fonts, scripts or styles loaded from another origin.</li>
      </ul>

      <h2>Who it is shared with</h2>
      <p>
        Nobody. {brand.name} has no third-party processors configured — no analytics provider, no
        email provider, no payment provider. If that changes, this notice changes with it and its
        version is bumped.
      </p>

      <h2>Email</h2>
      <p>
        Marketing email is off unless you switch it on. Every optional email carries an unsubscribe
        link and a <code>List-Unsubscribe</code> header. Essential account email continues while
        your account is open. No email provider is configured at present, so nothing is being sent.
      </p>

      <h2>How long it is kept</h2>
      <p>
        Until you delete it. Deleting your account removes your records immediately and permanently;
        there is no archive copy to restore from.
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>Export everything as JSON from Settings → Privacy &amp; data.</li>
        <li>See and end any active session from Settings → Security.</li>
        <li>Change or withdraw email consent at any time from Settings → Email.</li>
        <li>Delete your account, and everything in it, permanently.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Passwords are hashed with argon2id. Session tokens are stored only as hashes. Every request
        runs under a nonce-based Content Security Policy. Access to your records is scoped to your
        account in the database layer, and that boundary is covered by automated tests.
      </p>
      <p>
        No independent security audit or penetration test has been carried out. No certification of
        any kind is held or implied.
      </p>
    </>
  );
}
