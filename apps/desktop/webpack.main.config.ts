/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main/index.ts',
  // Put your normal webpack config below here
  // 中文注释：sharp 为原生模块，需走 Node 运行时加载，避免 webpack 打包导致 .node 无法解析。
  externals: [
    {
      sharp: 'commonjs2 sharp',
      libsql: 'commonjs2 libsql',
    },
    // 中文注释：libsql 使用动态加载的原生包，交给 Node 运行时解析 @libsql/*。
    ({ request }, callback) => {
      if (typeof request === 'string' && request.startsWith('@libsql/')) {
        return callback(null, `commonjs2 ${request}`);
      }
      return callback();
    },
  ],
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
};
