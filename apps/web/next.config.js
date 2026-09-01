/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next build` emits a self-contained server bundle (.next/standalone)
  // that the production Docker image runs with almost no node_modules.
  output: 'standalone',

  async rewrites() {
    // Same-origin API proxy. Browsers can't reach 127.0.0.1:3001 (the
    // user's machine has no API there), so when the configured API base
    // is a loopback URL, client code calls "/api/..." on this origin and
    // we proxy it to the API process server-side, where loopback works
    // (see lib/apiBase.ts). Non-loopback deployments never hit this:
    // the client keeps the absolute base and never requests /api here.
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*',
      },
      // Uploaded files: the API serves them at its own /uploads (app root,
      // no /api prefix). Same loopback reasoning as above - in dev and
      // proxied previews the browser asks the web origin for /uploads/*
      // and we forward it to the API, where loopback works.
      {
        source: '/uploads/:path*',
        destination: 'http://127.0.0.1:3001/uploads/:path*',
      },
    ];
  },
  
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/store-files/**',
      },
      // Merchants can paste arbitrary external image URLs into product
      // data; StoreImage renders those as plain <img>, but absolute
      // same-deployment URLs (e.g. an external API origin) go through
      // next/image and need an allowlist entry to render at all.
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    unoptimized: true,
  },
  
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
};

module.exports = nextConfig;
