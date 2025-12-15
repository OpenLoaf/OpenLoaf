import { tr } from "motion/react-client";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "export",
  images: {
    unoptimized: true,
  },
  reactStrictMode: true, //多次请求
};

export default nextConfig;
