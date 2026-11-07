import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@stella/brand-schema", "@stella/entitlements"],
  poweredByHeader: false,
};

export default nextConfig;
