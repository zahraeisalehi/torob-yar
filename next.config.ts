import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./data/fixtures/**/*', './node_modules/better-sqlite3/prebuilds/linux-x64.node'],
    '/**/*': ['./data/fixtures/**/*'],
  },
  // fixtures are read via process.cwd(); keep the trace from dragging raw data / the DB into the image
  outputFileTracingExcludes: {
    '/**/*': [
      './data/raw/**',
      './data/app.sqlite*',
      './data/rw/**',
      './docs/**',
      './prompts/**',
      './scripts/**',
      './e2e/**',
      './src/**',
      './.git/**',
      './node_modules/better-sqlite3/prebuilds/darwin*',
      './node_modules/better-sqlite3/prebuilds/win32*',
      './node_modules/better-sqlite3/prebuilds/linuxmusl*',
      './node_modules/better-sqlite3/prebuilds/*arm64*',
      './node_modules/better-sqlite3/deps/**',
      './node_modules/better-sqlite3/src/**',
    ],
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
