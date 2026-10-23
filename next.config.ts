import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./data/fixtures/**/*', './node_modules/better-sqlite3/prebuilds/linux-x64.node'],
    '/**/*': ['./data/fixtures/**/*'],
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
