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

import { CalloutPlugin } from '@platejs/callout/react';

import { CalloutElement } from '@openloaf/ui/callout-node';

export const CalloutKit = [CalloutPlugin.withComponent(CalloutElement)];
