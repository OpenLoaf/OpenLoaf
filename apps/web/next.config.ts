import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
