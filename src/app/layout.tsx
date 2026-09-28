import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
// Self-hosted Inter (SIL OFL-1.1). Bundled as local woff2 by the build — no
// request ever leaves the origin for a font. See docs/LICENSES.md.
import '@fontsource-variable/inter';
// Geist (SIL OFL-1.1), self-hosted by next/font/local. The variables live on
// <html> because the --font-display token that reads them resolves at the
// root; declared any lower, the token sees nothing and falls back to Inter.
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { brand } from '@/lib/brand';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Black unless the visitor chose White; rendered on the server so the
  // first paint is already the right theme.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={theme === 'light' ? 'light' : undefined}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
