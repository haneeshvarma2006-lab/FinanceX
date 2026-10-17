'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A form that waits behind a button.
 *
 * Pages used to show every "add" form open, all the time — on Finance three
 * of them took most of the screen before a single transaction. A sheet keeps
 * the page about what you have, and puts the form one tap away: a panel that
 * rises from the bottom on a phone and sits centred on a wide screen.
 *
 * It is a native <dialog> opened with showModal(), so focus is trapped,
 * Escape closes it, and the rest of the page is inert while it is open. The
 * form inside is mounted only while the sheet is open, so every visit starts
 * clean. When the form reports success (through FormAlert, below) the sheet
 * closes itself and the message moves to a small toast.
 */

type SheetApi = { done: (message: string) => void };
const SheetContext = createContext<SheetApi | null>(null);

/** Inside a sheet, the success message closes it instead of rendering. */
export function useSheet() {
  return useContext(SheetContext);
}

const TRIGGER = {
  primary:
    'bg-text-primary text-surface-sunken font-medium shadow-(--shadow-raised) hover:bg-text-primary/90',
  secondary:
    'border border-border-subtle bg-surface-overlay text-text-primary shadow-(--shadow-edge) hover:border-border-strong',
  ghost: 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
} as const;

export function Sheet({
  label,
  title,
  description,
  icon,
  variant = 'primary',
  defaultOpen = false,
  className,
  children,
}: {
  /** The button's text. */
  label: string;
  /** The panel's heading; the label is used when omitted. */
  title?: string;
  description?: string;
  icon?: ReactNode;
  variant?: keyof typeof TRIGGER;
  /** Opens on arrival — for a link that says "add one" from another page. */
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (defaultOpen) dialog.current?.showModal();
  }, [defaultOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function show() {
    setOpen(true);
    dialog.current?.showModal();
  }

  const api: SheetApi = {
    done(message) {
      dialog.current?.close();
      setToast(message);
    },
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm whitespace-nowrap',
          'transition-[background-color,border-color,scale] duration-[var(--duration-fast)] ease-(--ease-out-soft) active:scale-97',
          TRIGGER[variant],
          className,
        )}
      >
        <span aria-hidden className="[&>svg]:size-4">
          {icon ?? <Plus />}
        </span>
        {label}
      </button>

      <dialog
        ref={dialog}
        aria-label={title ?? label}
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the dialog element itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="nf-sheet"
      >
        {open && (
          <div className="flex max-h-[inherit] min-h-0 flex-col">
            <div aria-hidden className="nf-sheet-handle" />
            <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-text-primary">
                  {title ?? label}
                </h2>
                {description && (
                  <p className="mt-0.5 text-sm text-pretty text-text-secondary">{description}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => dialog.current?.close()}
                className="-mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
              >
                <X aria-hidden className="size-4" />
              </button>
            </header>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-6">
              <SheetContext.Provider value={api}>{children}</SheetContext.Provider>
            </div>
          </div>
        )}
      </dialog>

      {toast && <Toast message={toast} />}
    </>
  );
}

/** A confirmation that floats above everything for a moment, then leaves. */
function Toast({ message }: { message: string }) {
  return createPortal(
    <div
      role="status"
      className="nf-toast fixed inset-x-0 bottom-28 z-[60] flex justify-center px-4 sm:bottom-8"
    >
      <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-overlay py-2 pr-4 pl-2 text-sm text-text-primary shadow-(--shadow-sheet)">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-positive text-surface-sunken">
          <Check aria-hidden className="size-3.5" />
        </span>
        {message}
      </p>
    </div>,
    document.body,
  );
}
