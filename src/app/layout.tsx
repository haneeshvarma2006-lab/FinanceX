import type { Metadata, Viewport } from 'next';
// Self-hosted Inter (SIL OFL-1.1). Bundled as local woff2 by the build — no
// request ever leaves the origin for a font. See docs/LICENSES.md.
import '@fontsource-variable/inter';
import './globals.css';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
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
