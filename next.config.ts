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
  /** Habits became Lifestyle; old links and bookmarks keep working. */
  async redirects() {
    return [{ source: '/habits', destination: '/lifestyle', permanent: true }];
  },
  experimental: {
    // Server Actions already enforce an Origin check; this narrows it explicitly.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default config;
