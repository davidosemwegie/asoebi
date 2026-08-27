import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["davids-mac-mini.tailfca955.ts.net"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.convex.cloud",
        pathname: "/api/storage/**",
      },
      {
        protocol: "https",
        hostname: "*.convex.site",
        pathname: "/api/storage/**",
      },
    ],
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
