/** @type {import('next').NextConfig} */
const path = require("node:path");

const resolveFromWeb = (request) => require.resolve(request, { paths: [__dirname] });
const d3PathEsmEntry = resolveFromWeb("d3-path");

const nextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["@tenas-ai/ui", "@tenas-saas/sdk"],
  experimental: {
    externalDir: true,
  },
  output: "export",
  turbopack: {
    // Monorepo: ensure Next picks the workspace root (pnpm-lock.yaml) instead of
    // inferring it from unrelated lockfiles on the machine.
    // 逻辑：SDK 通过 link 指向上级目录的 Tenas-saas，需扩大 Turbopack 根目录。
    root: path.resolve(__dirname, "../Tenas-saas/packages/sdk"),
    resolveAlias: {
      "d3-path": "d3-path/src/index.js",
    },
  },
  webpack: (config, { dev }) => {
    config.resolve = config.resolve || {};
    // 逻辑：补齐 default 条件以兼容仅导出 default 的 SDK 子路径解析。
    const conditionNames = config.resolve.conditionNames || [];
    if (!conditionNames.includes("default")) {
      config.resolve.conditionNames = [...conditionNames, "default"];
    }
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
