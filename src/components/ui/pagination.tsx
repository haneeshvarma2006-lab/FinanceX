'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { pushWithParams } from '@/lib/navigation';
import type { Page } from '@/lib/query';

/**
 * Pagination that preserves every other query parameter, so paging does not
 * silently drop the filters the user applied.
 */
export function Pagination<T>({ page }: { page: Page<T> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goTo(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    pushWithParams(router, pathname, params);
  }

  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <p className="numeric text-xs text-text-muted" aria-live="polite">
        {first}–{last} of {page.total}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!page.hasPrevious}
          onClick={() => goTo(page.page - 1)}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!page.hasNext}
          onClick={() => goTo(page.page + 1)}
        >
          Next
          <ChevronRight aria-hidden className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}
