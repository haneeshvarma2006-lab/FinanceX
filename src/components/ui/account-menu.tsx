'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * The account menu: the avatar in the top bar, opening onto the person's
 * name, their settings and signing out.
 *
 * It replaces a row of loose header links (Settings · name · Sign out) that
 * competed with the main navigation for the same strip of space. Closing on
 * Escape, on a click outside and on navigation are all handled here.
 */
export function AccountMenu({
  name,
  email,
  signOut,
}: {
  name: string;
  email: string;
  /** The sign-out form, rendered on the server so it can carry the action. */
  signOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // A navigation closes the menu: adjusted during render, not in an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-full p-0.5 text-sm text-text-secondary sm:pr-2.5',
          'transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary',
          open && 'bg-surface-raised text-text-primary',
        )}
      >
        <Avatar name={name} />
        <span className="hidden max-w-28 truncate sm:inline">{firstName(name)}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'hidden size-3.5 transition-transform duration-[var(--duration-fast)] sm:block',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl p-1.5',
            'shadow-(--shadow-sheet) backdrop-blur-2xl ui-card',
            'origin-top-right animate-[nestedflow-enter_160ms_var(--ease-out-soft)]',
          )}
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{name}</p>
              <p className="truncate text-xs text-text-muted">{email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-border-subtle" />
          <MenuLink href="/settings" icon={<Settings className="size-4" />}>
            Settings
          </MenuLink>
          <MenuLink href="/settings/security" icon={<ShieldCheck className="size-4" />}>
            Security &amp; sessions
          </MenuLink>
          <MenuLink href="/settings/notifications" icon={<Bell className="size-4" />}>
            Notification settings
          </MenuLink>
          <div className="my-1 h-px bg-border-subtle" />
          {signOut}
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: '/settings' | '/settings/security' | '/settings/notifications';
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
    >
      <span aria-hidden className="text-text-muted">
        {icon}
      </span>
      {children}
    </Link>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-surface-sunken',
        'bg-linear-to-br from-tasks via-trading to-finance',
        size === 'lg' ? 'size-10 text-sm' : 'size-8 text-xs',
      )}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
