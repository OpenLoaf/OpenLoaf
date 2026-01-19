import type { ForgeConfig } from '@electron-forge/shared-types';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import path from 'path';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

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
    appBundleId: 'com.hexems.tenas',
    extendInfo: {
      NSMicrophoneUsageDescription: '语音输入需要访问麦克风。',
      NSSpeechRecognitionUsageDescription: '语音输入需要使用系统语音识别。',
    },
    extraResource: [
      '../../apps/server/dist/server.mjs',
      // Pre-built SQLite DB with schema applied (copied to userData on first run).
      '../../apps/server/dist/seed.db',
      '../../apps/web/out',
      '../../apps/electron/resources/speech',
      '../../apps/electron/resources/runtime.env',
      '../../apps/electron/resources/icon.icns',
      '../../apps/electron/resources/icon.ico',
      '../../apps/electron/resources/icon.png',
      // Sharp ships native bindings via optional deps (e.g. @img/sharp-darwin-arm64).
      '../../node_modules/sharp',
      '../../node_modules/@img',
      // node-pty 依赖 native prebuilds（pty.node 与 spawn-helper），需要随应用打包。
      '../../node_modules/node-pty/prebuilds',
      // Prisma libsql adapter loads a native binding at runtime (e.g. `@libsql/darwin-arm64`).
      // Since `server.mjs` is executed from `process.resourcesPath`, ship the `@libsql/*` packages
      // into Resources as well (resolved via NODE_PATH in prodServices).
      '../../node_modules/@libsql',
    ],
  },
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
