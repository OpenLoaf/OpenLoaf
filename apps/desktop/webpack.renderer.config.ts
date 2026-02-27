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
import path from 'path';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

const isProd = process.env.NODE_ENV === 'production';

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  devtool: isProd ? false : 'source-map',
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx'],
    alias: {
      '@trpc/client': path.resolve(__dirname, '../../node_modules/@trpc/client'),
      '@trpc/server': path.resolve(__dirname, '../../node_modules/@trpc/server'),
    },
  },
};
