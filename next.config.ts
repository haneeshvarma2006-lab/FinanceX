import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // Server Actions already enforce an Origin check; this narrows it explicitly.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default config;
