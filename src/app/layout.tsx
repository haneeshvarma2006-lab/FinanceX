import type { Metadata, Viewport } from 'next';
// Self-hosted Inter (SIL OFL-1.1). Bundled as local woff2 by the build — no
// request ever leaves the origin for a font. See docs/LICENSES.md.
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  // Working name only — see docs/OPEN-DECISIONS.md D-01. No branding is
  // committed to until the name is cleared.
  title: { default: 'KyliX', template: '%s · KyliX' },
  description: 'Tasks, habits, goals, finances and trading — connected.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c1018' },
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
