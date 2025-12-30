'use client';

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';

import { MentionInputElement } from '@/components/ui/mention-node';
import { TeatimeMentionElement } from '@/components/ui/teatime/TeatimeMentionNode';

export const MentionKit = [
  MentionPlugin.configure({
    options: {
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).withComponent(TeatimeMentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];
