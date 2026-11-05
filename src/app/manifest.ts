import type { MetadataRoute } from 'next';

import { brand } from '@/lib/brand';
import { dark, light } from '@nestedflow/tokens';

/**
 * The web app manifest.
 *
 * Generated rather than written as static JSON so the name and the theme
 * colours come from the same two sources the rest of the product uses — a
 * hand-maintained `manifest.json` is exactly the file that still says the old
 * name two renames later.
 *
 * `display: standalone` and the PNG icons below make the app installable:
 * Android turns it into a real app only with 192 and 512 pixel PNGs. The
 * service worker (public/sw.js) shows push notifications and an offline page;
 * it never caches the user's records, because a stale balance would be worse
 * than an honest "you're offline".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/today',
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: toHexish(dark.surfaceSunken),
    theme_color: toHexish(dark.surfaceBase),
    categories: ['productivity', 'finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    // Long-press the home-screen icon for these.
    shortcuts: [
      {
        name: 'Add a transaction',
        short_name: 'Add',
        url: '/finance?new=transaction',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Import a bank statement',
        short_name: 'Import',
        url: '/finance/import',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Where my money went',
        short_name: 'Insights',
        url: '/finance/insights',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}

/**
 * The manifest spec predates OKLCH and several installers still reject a
 * colour they cannot parse, so the two colours that appear here are given as
 * sRGB. They are declared beside the tokens they mirror rather than typed in
 * somewhere else, and a test asserts the pair stays in step.
 */
export const MANIFEST_SRGB: Record<string, string> = {
  [dark.surfaceSunken]: '#000000',
  [dark.surfaceBase]: '#0a0a0a',
  [light.surfaceSunken]: '#fafafa',
  [light.surfaceBase]: '#ffffff',
};

export function toHexish(oklch: string): string {
  const hex = MANIFEST_SRGB[oklch];
  if (!hex) throw new Error(`No sRGB fallback recorded for ${oklch}`);
  return hex;
}
