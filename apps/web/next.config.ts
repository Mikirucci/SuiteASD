import type { NextConfig } from "next";

const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:8080").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The browser calls the API on the same origin; in production a reverse proxy does this, in development Next does.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
