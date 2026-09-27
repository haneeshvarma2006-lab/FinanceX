'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Wordmark } from '@/components/ui/wordmark';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '#features', label: 'Product' },
  { href: '#connected', label: 'How it connects' },
  { href: '#analytics', label: 'Analytics' },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

const noop = () => () => {};

/**
 * The phone's menu: a full-screen sheet of glass that the section links rise
 * into, one after another, set large. Rendered into <body> through a portal
 * because the nav bar it opens from is a blurred surface, and a blurred
 * surface traps anything `position: fixed` inside it.
 */
export function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  // True only in the browser, so the portal never renders on the server.
  const isClient = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="inline-flex size-10 items-center justify-center rounded-full text-brand-ink transition-colors hover:bg-brand-ink/5 md:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>

      {isClient &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="menu"
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                className="fixed inset-0 z-90 flex flex-col bg-brand-canvas/96 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] backdrop-blur-2xl md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <div
                  aria-hidden
                  className="lp-horizon pointer-events-none absolute inset-x-0 top-0 h-96"
                />

                <div className="relative flex h-14 items-center justify-between">
                  <Link href="/" onClick={close} aria-label="Home">
                    <Wordmark className="text-lg text-brand-ink" />
                  </Link>
                  <div className="flex items-center gap-1">
                    <ThemeToggle className="text-brand-ink-muted hover:bg-brand-ink/5 hover:text-brand-ink" />
                    <button
                      type="button"
                      onClick={close}
                      aria-label="Close menu"
                      className="inline-flex size-10 items-center justify-center rounded-full text-brand-ink hover:bg-brand-ink/5"
                    >
                      <X aria-hidden className="size-5" />
                    </button>
                  </div>
                </div>

                <nav aria-label="Sections" className="relative mt-12 flex flex-col">
                  {LINKS.map((link, i) => (
                    <motion.a
                      key={link.href}
                      href={link.href}
                      onClick={close}
                      className="group flex items-center justify-between border-b border-brand-line/70 py-5 text-3xl font-semibold tracking-tighter text-brand-ink"
                      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ duration: 0.55, ease: EASE, delay: 0.08 + i * 0.07 }}
                    >
                      {link.label}
                      <ArrowRight
                        aria-hidden
                        className="size-5 text-brand-ink-subtle transition-transform group-hover:translate-x-1"
                      />
                    </motion.a>
                  ))}
                </nav>

                <motion.div
                  className="relative mt-auto flex flex-col gap-3"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
                >
                  {signedIn ? (
                    <MenuButton href="/today" primary onClick={close}>
                      Open your dashboard
                    </MenuButton>
                  ) : (
                    <>
                      <MenuButton href="/sign-up" primary onClick={close}>
                        Get early access
                      </MenuButton>
                      <MenuButton href="/sign-in" onClick={close}>
                        Sign in
                      </MenuButton>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function MenuButton({
  href,
  primary = false,
  onClick,
  children,
}: {
  href: '/today' | '/sign-up' | '/sign-in';
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'inline-flex h-13 items-center justify-center gap-2 rounded-full text-base font-medium',
        primary ? 'lp-btn-glow bg-brand-ink text-brand-canvas' : 'lp-card text-brand-ink',
      )}
    >
      {children}
      {primary && <ArrowRight aria-hidden className="size-4" />}
    </Link>
  );
}
