'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteBillAction } from '../../scan/actions';

/** Delete a kept photo, with one confirming tap. The expense stays. */
export function DeleteBill({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        icon={<Trash2 aria-hidden className="size-4" />}
      >
        Delete photo
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-secondary">Delete this photo for good?</span>
      <Button
        type="button"
        variant="danger"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteBillAction(id);
            if (result.ok) router.push('/finance/bills');
            else setFailed(true);
          })
        }
      >
        Delete
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      {failed && (
        <p role="alert" className="text-xs text-negative">
          It could not be deleted. Try again.
        </p>
      )}
    </div>
  );
}
