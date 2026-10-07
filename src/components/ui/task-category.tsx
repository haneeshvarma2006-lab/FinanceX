import {
  Briefcase,
  CandlestickChart,
  Dumbbell,
  Moon,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { TASK_CATEGORY_LABELS, type TaskCategory } from '@/modules/productivity/validators';

export const TASK_CATEGORY_ICONS: Record<TaskCategory, LucideIcon> = {
  work: Briefcase,
  trading: CandlestickChart,
  gym: Dumbbell,
  eating: Utensils,
  sleeping: Moon,
};

/** The small label a task wears in a list: icon plus word, never icon alone. */
export function TaskCategoryTag({ category }: { category: string | null }) {
  if (!category || !(category in TASK_CATEGORY_ICONS)) return null;
  const key = category as TaskCategory;
  const Icon = TASK_CATEGORY_ICONS[key];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-inset px-2 py-0.5',
        'text-2xs leading-4 font-medium whitespace-nowrap text-text-secondary',
      )}
    >
      <Icon aria-hidden className="size-3" />
      {TASK_CATEGORY_LABELS[key]}
    </span>
  );
}
