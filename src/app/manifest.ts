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
 * `display: standalone` and the icons below make the app installable. It is
 * not an offline-capable PWA: there is no service worker, because every screen
 * reads the user's own records from the server and a stale cached balance
 * would be worse than an honest failure to load.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
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
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
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
  [dark.surfaceSunken]: '#0c1018',
  [dark.surfaceBase]: '#11151f',
  [light.surfaceSunken]: '#f2f3f7',
  [light.surfaceBase]: '#fbfbfd',
};

export function toHexish(oklch: string): string {
  const hex = MANIFEST_SRGB[oklch];
  if (!hex) throw new Error(`No sRGB fallback recorded for ${oklch}`);
  return hex;
}
