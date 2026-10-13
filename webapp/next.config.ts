import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: resolve(process.cwd(), '..') },
  async redirects() {
    return [{ source: '/pricing', destination: '/get-access', permanent: true }];
  },
};

export default nextConfig;
