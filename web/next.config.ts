import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      { source: "/news", destination: "/reports", permanent: true },
      { source: "/stories", destination: "/reports", permanent: true },
    ];
  },
};

export default nextConfig;
