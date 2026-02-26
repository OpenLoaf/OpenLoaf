'use client';

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
