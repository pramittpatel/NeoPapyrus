import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  allowedDevOrigins: ["dev.embedez.com"],
  serverExternalPackages: ["snowflake-sdk"],
};

export default nextConfig;
