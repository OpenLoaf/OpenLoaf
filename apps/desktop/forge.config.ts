import type { ForgeConfig } from '@electron-forge/shared-types';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import path from 'path';
import fs from 'fs';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

// ---------------------------------------------------------------------------
// postPackage 钩子：递归解析原生依赖树并复制到 Resources/node_modules/
// ---------------------------------------------------------------------------
// 根本问题：electron-packager 的 extraResource 只按 basename 平铺到 Resources/，
// 无法处理传递依赖。例如 sharp 依赖 detect-libc、semver，但 pnpm hoisted 模式下
// 这些依赖在根 node_modules/ 而非 sharp/node_modules/ 内。
//
// 解决方案：不在 extraResource 中列出 npm 包，改为在 postPackage 钩子中
// 递归遍历依赖树，从 monorepo 的 node_modules/ 直接复制到 Resources/node_modules/。
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MONOREPO_NODE_MODULES = path.resolve(REPO_ROOT, 'node_modules');

/**
 * 需要随应用打包的原生/运行时依赖根节点。
 * - 普通包名（如 'sharp'）：递归收集该包及其所有传递依赖。
 * - scope 名（如 '@libsql'）：枚举 scope 下所有子包，逐一递归收集。
 *   与 webpack externals 的 `request.startsWith('@libsql/')` 规则对齐。
 */
const NATIVE_DEP_ROOTS = [
  'sharp', // 图片处理（webpack external: sharp）
  'libsql', // SQLite native binding（webpack external: libsql）
  '@libsql', // Prisma libsql adapter 全部子包（webpack external: @libsql/*）
  'playwright-core', // 网页自动化（esbuild external）
];

/**
 * 平台特定包名模式 - 用于过滤不属于目标平台的包。
 * 这些包名包含平台/架构标识符，需要按目标平台过滤。
 * 每个模式使用命名捕获组 platform 和 arch。
 */
const PLATFORM_PACKAGE_PATTERNS = [
  // @img/sharp-{os}-{arch}, @img/sharp-libvips-{os}-{arch}
  /^@img\/sharp(-libvips)?-(?<platform>darwin|linux|linuxmusl|win32)-(?<arch>arm64|x64)$/,
  // @libsql/{os}-{arch}[-variant]
  /^@libsql\/(?<platform>darwin|linux|win32)-(?<arch>arm64|x64)(-gnu|-musl|-msvc)?$/,
];

/**
 * 检查包名是否是平台特定包，如果是，检查是否匹配目标平台。
 * @returns true 如果应该包含该包（非平台特定包，或匹配目标平台）
 */
function shouldIncludePackage(
  packageName: string,
  targetPlatform: string,
  targetArch: string,
): boolean {
  for (const pattern of PLATFORM_PACKAGE_PATTERNS) {
    const match = packageName.match(pattern);
    if (match?.groups) {
      const { platform: pkgPlatform, arch: pkgArch } = match.groups;
      // linuxmusl 视为 linux
      const normalizedPkgPlatform = pkgPlatform === 'linuxmusl' ? 'linux' : pkgPlatform;
      return normalizedPkgPlatform === targetPlatform && pkgArch === targetArch;
    }
  }
  // 非平台特定包，始终包含
  return true;
}

/**
 * 递归收集指定包的所有 production 依赖（dependencies + optionalDependencies）。
 * 仅收集当前平台已安装的可选依赖（不存在则跳过）。
 */
function collectDeps(
  packageName: string,
  nmDir: string,
  visited: Set<string>,
): void {
  if (visited.has(packageName)) return;

  const pkgDir = path.join(nmDir, packageName);
  if (!fs.existsSync(pkgDir)) return; // 可选依赖在当前平台未安装，跳过

  visited.add(packageName);

  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;

  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {}),
    };
    for (const dep of Object.keys(allDeps)) {
      collectDeps(dep, nmDir, visited);
    }
  } catch {
    // package.json 读取失败时仅复制包本身
  }
}

/**
 * 处理一个 NATIVE_DEP_ROOTS 条目：
 * - 如果是 scope（以 @ 开头且无 /），枚举 scope 下所有子包并递归
 * - 否则直接递归收集
 */
function collectRoot(
  root: string,
  nmDir: string,
  visited: Set<string>,
): void {
  const isScope = root.startsWith('@') && !root.includes('/');
  if (isScope) {
    const scopeDir = path.join(nmDir, root);
    if (!fs.existsSync(scopeDir)) return;
    try {
      for (const entry of fs.readdirSync(scopeDir)) {
        collectDeps(`${root}/${entry}`, nmDir, visited);
      }
    } catch {
      // ignore
    }
  } else {
    collectDeps(root, nmDir, visited);
  }
}

/**
 * 根据打包平台定位 Resources 目录。
 * - macOS:   out/OpenLoaf-darwin-arm64/OpenLoaf.app/Contents/Resources/
 * - Windows: out/OpenLoaf-win32-x64/resources/
 * - Linux:   out/OpenLoaf-linux-x64/resources/
 */
function resolveResourcesDir(outputPath: string, platform: string): string | null {
  if (platform === 'darwin') {
    const appDir = fs.readdirSync(outputPath).find((f) => f.endsWith('.app'));
    if (!appDir) return null;
    return path.join(outputPath, appDir, 'Contents', 'Resources');
  }
  // Windows / Linux: resources/ (小写)
  return path.join(outputPath, 'resources');
}

const postPackageHook: ForgeConfig['hooks'] = {
  postPackage: async (_config, options) => {
    const platform = options.platform as string;
    const arch = options.arch as string;
    for (const outputPath of options.outputPaths) {
      console.log(`[postPackage] platform=${platform} arch=${arch} outputPath: ${outputPath}`);

      const resourcesDir = resolveResourcesDir(outputPath, platform);
      if (!resourcesDir || !fs.existsSync(resourcesDir)) continue;

      const destNmDir = path.join(resourcesDir, 'node_modules');
      fs.mkdirSync(destNmDir, { recursive: true });

      // 1) 递归收集所有需要的包（支持 scope 级别枚举）
      const allPackages = new Set<string>();
      for (const root of NATIVE_DEP_ROOTS) {
        collectRoot(root, MONOREPO_NODE_MODULES, allPackages);
      }

      // 2) 按目标平台过滤平台特定包
      const filteredPackages = [...allPackages].filter((pkg) =>
        shouldIncludePackage(pkg, platform, arch),
      );

      console.log(
        `[postPackage] Resolved ${allPackages.size} packages, ${filteredPackages.length} after platform filtering (${platform}-${arch})`,
      );

      // 3) 从 monorepo node_modules 复制到 Resources/node_modules/
      for (const pkg of filteredPackages) {
        const src = path.join(MONOREPO_NODE_MODULES, pkg);
        const dest = path.join(destNmDir, pkg);
        if (fs.existsSync(dest)) continue;

        // scoped 包需先创建 scope 目录
        if (pkg.startsWith('@')) {
          fs.mkdirSync(path.join(destNmDir, pkg.split('/')[0]), { recursive: true });
        }

        fs.cpSync(src, dest, { recursive: true });
        console.log(`[postPackage]   + ${pkg}`);
      }

      // 4) node-pty prebuilds：按目标平台只复制对应的 prebuild
      //    node-pty 被 esbuild 打包进 server.mjs，加载 pty.node 时用
      //    相对于 server.mjs 的路径 ./prebuilds/{platform}-{arch}/pty.node
      const prebuildsSrc = path.join(MONOREPO_NODE_MODULES, 'node-pty', 'prebuilds');
      if (fs.existsSync(prebuildsSrc)) {
        const prebuildsDest = path.join(resourcesDir, 'prebuilds');
        const targetPrebuild = `${platform}-${arch}`;
        const targetPrebuildSrc = path.join(prebuildsSrc, targetPrebuild);

        if (fs.existsSync(targetPrebuildSrc)) {
          const targetPrebuildDest = path.join(prebuildsDest, targetPrebuild);
          fs.mkdirSync(targetPrebuildDest, { recursive: true });
          fs.cpSync(targetPrebuildSrc, targetPrebuildDest, { recursive: true });
          console.log(`[postPackage]   + prebuilds/${targetPrebuild}/ (node-pty)`);
        } else {
          console.warn(`[postPackage] node-pty prebuild not found for ${targetPrebuild}`);
        }
      }

      // 5) 版本信息：extraResource 会按 basename 平铺，这里手动复制并改名。
      const serverPkgSrc = path.join(REPO_ROOT, 'apps', 'server', 'package.json');
      const webPkgSrc = path.join(REPO_ROOT, 'apps', 'web', 'package.json');
      const serverPkgDest = path.join(resourcesDir, 'server.package.json');
      const webPkgDest = path.join(resourcesDir, 'web.package.json');
      try {
        if (fs.existsSync(serverPkgSrc)) {
          fs.copyFileSync(serverPkgSrc, serverPkgDest);
          console.log('[postPackage]   + server.package.json');
        }
        if (fs.existsSync(webPkgSrc)) {
          fs.copyFileSync(webPkgSrc, webPkgDest);
          console.log('[postPackage]   + web.package.json');
        }
      } catch (err) {
        console.warn('[postPackage] Failed to copy version metadata:', err);
      }
    }
  },
};

// 中文注释：按平台指定打包图标，避免 packager 读取错误格式。
const packagerIcon = path.resolve(
  __dirname,
  'resources',
  process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.png'
);

const config: ForgeConfig = {
  packagerConfig: {
    icon: packagerIcon,
    asar: true,
    appBundleId: 'com.hexems.openloaf',
    // 中文注释：注册自定义协议，支持 openloaf:// 唤起。
    protocols: [
      {
        name: 'OpenLoaf',
        schemes: ['openloaf'],
      },
    ],
    extendInfo: {
      NSMicrophoneUsageDescription: '语音输入需要访问麦克风。',
      NSSpeechRecognitionUsageDescription: '语音输入需要使用系统语音识别。',
    },
    extraResource: [
      '../../apps/server/dist/server.mjs',
      // Pre-built SQLite DB with schema applied (copied to userData on first run).
      '../../apps/server/dist/seed.db',
      '../../apps/web/out',
      '../../apps/desktop/resources/speech',
      '../../apps/desktop/resources/runtime.env',
      '../../apps/desktop/resources/icon.icns',
      '../../apps/desktop/resources/icon.ico',
      '../../apps/desktop/resources/icon.png',
      // npm 包（sharp、@libsql、playwright-core 等）及其所有传递依赖
      // 由 postPackage 钩子递归解析并复制到 Resources/node_modules/，
      // 不再在此手动列出，避免遗漏传递依赖导致运行时 module not found。
    ],
  },
  hooks: postPackageHook,
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({}, ['darwin']),
  ],
  plugins: [
    new WebpackPlugin({
      port: 3002,
      loggerPort: 3003,
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/fallback.html',
            js: './src/renderer/fallback.ts',
            name: 'main_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
          {
            html: './src/renderer/loading.html',
            js: './src/renderer/loading.ts',
            name: 'loading_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
    }),
  ],
};

export default config;
