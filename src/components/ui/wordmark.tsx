import { brand } from '@/lib/brand';
import { cn } from '@/lib/cn';

/**
 * The wordmark.
 *
 * One component, because this used to be four hand-built copies with the
 * name split across two JSX nodes — so a search for the product name found
 * none of them. A rename now changes `src/lib/brand.ts` and nothing else.
 *
 * The two halves differ only in colour. Colour is never the only signal here
 * because the text reads the same either way; this is decoration on top of a
 * word, not information.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-tight whitespace-nowrap', className)}>
      {brand.wordmark.lead}
      <span className="text-accent">{brand.wordmark.accent}</span>
    </span>
  );
}
