/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Configuration } from 'webpack';

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
  },
};
