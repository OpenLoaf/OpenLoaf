'use client';

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';

import { MentionInputElement } from '@/components/ui/mention-node';
import { TenasMentionElement } from '@/components/ui/tenas/TenasMentionNode';

export const MentionKit = [
  MentionPlugin.configure({
    options: {
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).withComponent(TenasMentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];
