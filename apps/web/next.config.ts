import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so stray lockfiles in parent folders are ignored.
  turbopack: { root: __dirname },
};

export default nextConfig;
