import { Skeleton } from '@/components/ui/states';

/**
 * Shown the instant a tab is tapped, while the server renders the page.
 *
 * Without it the old screen stays put until the new one is ready, and the
 * app feels like it ignored the tap. The shape matches a real page — a title
 * and two cards — so nothing jumps when the content arrives.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-10 w-64 rounded-xl sm:h-12" />
        <Skeleton className="h-4 w-80 max-w-full rounded-full" />
      </div>
      <div className="ui-card flex flex-col gap-4 rounded-2xl p-5">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2 w-2/3 rounded-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="ui-card flex flex-col gap-4 rounded-2xl p-5">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
