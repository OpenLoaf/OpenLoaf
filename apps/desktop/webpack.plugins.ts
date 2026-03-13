/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import webpack from 'webpack';

export const plugins = [
  new webpack.DefinePlugin({
    'process.env.OPENLOAF_EDITION': JSON.stringify(process.env.OPENLOAF_EDITION || 'community'),
  }),
];
