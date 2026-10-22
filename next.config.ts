import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  /**
   * argon2 is a native addon. Bundling it breaks the `.node` binary, and a
   * password hash that cannot run is a sign-in outage, so it stays external
   * and is traced into the deployment as a real file.
   */
  serverExternalPackages: ['@node-rs/argon2'],
  /**
   * The bill reader's engine (Tesseract, compiled to WebAssembly) runs in a
   * worker loaded from /ocr. That worker gets its own policy: it may load its
   * own scripts, compile WebAssembly and fetch its language data from this
   * origin — and nothing else. The app's pages never get 'wasm-unsafe-eval'.
   */
  async headers() {
    return [
      {
        source: '/ocr/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
      {
        // The statement PDF reader's worker and character maps: it may fetch
        // the maps from this origin and nothing else.
        source: '/pdf/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; script-src 'self'; connect-src 'self'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Lifestyle was removed; Goals became a tab of Tasks. Old links and
      // bookmarks still land somewhere that exists.
      { source: '/habits', destination: '/today', permanent: false },
      { source: '/lifestyle/:path*', destination: '/today', permanent: false },
      { source: '/lifestyle', destination: '/today', permanent: false },
      { source: '/goals', destination: '/tasks/goals', permanent: true },
    ];
  },
  experimental: {
    // Server Actions already enforce an Origin check; this narrows it explicitly.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default config;
