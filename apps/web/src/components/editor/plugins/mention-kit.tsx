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

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';

import { MentionInputElement } from '@openloaf/ui/mention-node';
import { OpenLoafMentionElement } from '@openloaf/ui/openloaf/OpenLoafMentionNode';

export const MentionKit = [
  MentionPlugin.configure({
    options: {
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).withComponent(OpenLoafMentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];
