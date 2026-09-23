import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/">
            <Wordmark className="text-sm" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="flex flex-col gap-5 text-sm leading-relaxed text-pretty text-text-secondary [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-text-primary [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text-primary">
          {children}
        </article>
      </main>
    </div>
  );
}
