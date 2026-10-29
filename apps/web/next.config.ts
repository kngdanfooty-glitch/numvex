import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@numvexs/shared'],
  // The API on Render's free plan sleeps and takes about 45 to 60 seconds to wake. The proxy below gives up after 30
  // seconds by default, which the visitor sees as a 502. Wait for the API instead: slow once, but sign-in and sign-up work.
  experimental: { proxyTimeout: 120_000 },
  async headers() {
    // The worker file must always be fetched fresh, or a fix to it would never reach people who already installed the app.
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] }];
  },
  async rewrites() {
    // Proxy API calls in dev so the browser stays same-origin and cookies "just work".
    const apiBase = process.env.API_PROXY_TARGET ?? 'http://localhost:4200';
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
