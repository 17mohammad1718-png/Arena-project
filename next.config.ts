import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Arena preview proxies the dev server through an *.e2b.app host.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
