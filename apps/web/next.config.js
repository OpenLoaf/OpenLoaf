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
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
