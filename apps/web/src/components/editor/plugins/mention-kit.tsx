'use client';

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';

import { MentionInputElement } from '@tenas-ai/ui/mention-node';
import { TenasMentionElement } from '@tenas-ai/ui/tenas/TenasMentionNode';

export const MentionKit = [
  MentionPlugin.configure({
    options: {
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).withComponent(TenasMentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];
