/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["@openloaf/ui", "@openloaf-saas/sdk"],
  experimental: {
    externalDir: true,
  },
  output: "export",
  turbopack: {
    resolveAlias: {
      "d3-path": "d3-path/src/index.js",
    },
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true, //多次请求
};

module.exports = nextConfig;
