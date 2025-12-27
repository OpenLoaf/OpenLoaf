/** @type {import('next').NextConfig} */
const path = require("node:path");

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "export",
  eslint: {
    // 只 lint 源码目录，避免 Next/Eslint 扫描到 .next 生成产物导致告警
    dirs: ["src"],
  },
  turbopack: {
    // Monorepo: ensure Next picks the workspace root (pnpm-lock.yaml) instead of
    // inferring it from unrelated lockfiles on the machine.
    root: path.resolve(__dirname, "../.."),
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true, //多次请求
};

module.exports = nextConfig;
