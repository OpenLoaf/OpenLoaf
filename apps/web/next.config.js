/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/** @type {import('next').NextConfig} */
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
