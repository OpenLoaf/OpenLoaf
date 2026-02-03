/** @type {import('next').NextConfig} */
const path = require("node:path");

const resolveFromWeb = (request) => require.resolve(request, { paths: [__dirname] });
const d3PathEsmEntry = resolveFromWeb("d3-path");

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["@tenas-ai/ui", "@tenas-saas/sdk"],
  output: "export",
  turbopack: {
    // Monorepo: ensure Next picks the workspace root (pnpm-lock.yaml) instead of
    // inferring it from unrelated lockfiles on the machine.
    root: path.resolve(__dirname, "../.."),
    resolveAlias: {
      "d3-path": "d3-path/src/index.js",
    },
  },
  webpack: (config, { dev }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "d3-path": d3PathEsmEntry,
    };
    if (dev) {
      // 开发环境禁用 eval source map，避免 CSP 阻止 webpack runtime。
      config.devtool = "source-map";
    }
    return config;
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true, //多次请求
};

module.exports = nextConfig;
