/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client';

import { DatePlugin } from '@platejs/date/react';

import { DateElement } from '@openloaf/ui/date-node';

export const DateKit = [DatePlugin.withComponent(DateElement)];
