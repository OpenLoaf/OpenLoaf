/** @type {import('next').NextConfig} */
const path = require("node:path");

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "export",
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
