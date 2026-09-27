import {
  CalendarClock,
  Download,
  Flame,
  Gauge,
  Layers,
  ListChecks,
  Moon,
  PiggyBank,
  Receipt,
  Target,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tone } from './charts';
import { TONE_TEXT } from './primitives';

/**
 * A slow band of what the product does, sliding past under the hero. Every
 * item is a shipped capability, not a roadmap promise. Two identical copies
 * sit side by side and the band moves one copy's width, so the loop is
 * seamless; hovering pauses it, and reduced motion stops it entirely.
 */
const ITEMS: readonly { icon: LucideIcon; label: string; tone: Tone | 'neutral' }[] = [
  { icon: ListChecks, label: 'Recurring tasks', tone: 'tasks' },
  { icon: Receipt, label: 'P&L from your fills', tone: 'trading' },
  { icon: Wallet, label: 'Every account, one ledger', tone: 'finance' },
  { icon: Flame, label: 'Lifestyle streaks', tone: 'tasks' },
  { icon: Gauge, label: 'Budgets that alert', tone: 'finance' },
  { icon: Layers, label: 'Live · paper · backtest', tone: 'trading' },
  { icon: Workflow, label: 'Rules you can read', tone: 'neutral' },
  { icon: Target, label: 'Goals with a pace', tone: 'finance' },
  { icon: PiggyBank, label: 'Exact to the paisa', tone: 'finance' },
  { icon: CalendarClock, label: 'Your timezone, always', tone: 'tasks' },
  { icon: Download, label: 'Export all your data', tone: 'neutral' },
  { icon: Moon, label: 'Black & White themes', tone: 'neutral' },
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {ITEMS.map(({ icon: Icon, label, tone }) => (
        <li
          key={label}
          className="inline-flex items-center gap-2 rounded-full border border-brand-line/80 bg-brand-card/50 px-3.5 py-1.5 text-xs whitespace-nowrap text-brand-ink-muted"
        >
          <Icon
            aria-hidden
            className={cn('size-3.5', tone === 'neutral' ? 'text-brand-ink' : TONE_TEXT[tone])}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function Ticker() {
  return (
    <section aria-label="What it does" className="border-y border-brand-line/60 py-5">
      <div className="lp-ticker-wrap overflow-hidden">
        <div className="lp-ticker flex w-max">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
