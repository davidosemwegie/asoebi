import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["davids-mac-mini.tailfca955.ts.net"],
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
