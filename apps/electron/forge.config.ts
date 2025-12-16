import type { ForgeConfig } from '@electron-forge/shared-types';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appId: 'com.hexems.teatime',
    appBundleId: 'com.hexems.teatime',
    extraResource: [
      '../../apps/server/dist/server.mjs',
      '../../apps/web/out',
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
