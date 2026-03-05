import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/research",
        destination: "/research.html",
      },
    ];
  },
};

export default nextConfig;
