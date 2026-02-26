/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { BaseDatePlugin } from '@platejs/date';

import { DateElementStatic } from '@openloaf/ui/date-node-static';

export const BaseDateKit = [BaseDatePlugin.withComponent(DateElementStatic)];
