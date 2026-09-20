import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Terms of use</h1>
      <p className="numeric text-xs text-text-muted">Version 2026-09-20 · Draft</p>

      <p>
        <strong>This is a draft, not reviewed by a lawyer.</strong> It describes how KyliX is
        intended to work and is published so the product does not ship with nothing in its place. It
        must be reviewed by a qualified legal adviser for the jurisdictions KyliX will operate in
        before any public launch.
      </p>

      <h2>What KyliX is</h2>
      <p>
        KyliX is a personal record-keeping tool. It helps you organise tasks, track money you have
        already spent or received, and keep a journal of trades you have already placed elsewhere.
      </p>

      <h2>What KyliX is not</h2>
      <ul>
        <li>
          <strong>Not financial, investment or tax advice.</strong> Nothing in KyliX is a
          recommendation to buy, sell or hold anything.
        </li>
        <li>
          <strong>Not a broker and not connected to one.</strong> KyliX cannot place, modify or
          cancel an order. It has no connection to any exchange or broker.
        </li>
        <li>
          <strong>Not a source of market data.</strong> Every price in KyliX was typed in by you.
        </li>
        <li>
          <strong>Not a bank and not connected to one.</strong> No account is linked and no balance
          is fetched.
        </li>
      </ul>

      <h2>Your data is yours</h2>
      <p>
        Everything in KyliX is entered by you. You can export all of it at any time from Settings,
        and you can delete your account and its contents permanently.
      </p>

      <h2>Accuracy</h2>
      <p>
        KyliX calculates from the figures you enter. If a figure is wrong, every total derived from
        it is wrong. Nothing here is a substitute for your own records or for statements from your
        bank or broker.
      </p>

      <h2>No guarantee of outcomes</h2>
      <p>
        Statistics shown in the trading journal — win rate, profit factor, expectancy, R-multiples,
        equity curves — describe trades you have already recorded. They do not predict future
        results, and past performance does not indicate future performance.
      </p>

      <h2>Age</h2>
      <p>
        KyliX is for people aged 18 and over. See the age policy for how this is applied and what it
        does and does not amount to.
      </p>

      <h2>Availability</h2>
      <p>
        This is an early build. It may change, break, or be taken offline. Keep your own copies of
        anything you cannot afford to lose.
      </p>
    </>
  );
}
