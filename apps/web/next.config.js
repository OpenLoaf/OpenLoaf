/** @type {import('next').NextConfig} */
const path = require("node:path");

const resolveFromWeb = (request) => require.resolve(request, { paths: [__dirname] });
const d3PathEsmEntry = resolveFromWeb("d3-path");

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "export",
  turbopack: {
    // Monorepo: ensure Next picks the workspace root (pnpm-lock.yaml) instead of
    // inferring it from unrelated lockfiles on the machine.
    root: path.resolve(__dirname, "../.."),
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "d3-path": d3PathEsmEntry,
    };
    return config;
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true, //多次请求
};

module.exports = nextConfig;
