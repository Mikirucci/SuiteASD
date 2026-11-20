import path from "node:path";
import type { NextConfig } from "next";

const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:8080").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A self-contained server (server.js and only the files it needs) for the Docker image.
  output: "standalone",
  // The workspace lives at the repository root: trace from there so the standalone server finds its dependencies.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // The browser calls the API on the same origin; in development Next forwards it to the backend. In production the
  // reverse proxy (Caddy) sends /api/v1 to the backend before a request ever reaches this server.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
