import { BaseMentionPlugin } from '@platejs/mention';

import { MentionElementStatic } from '@tenas-ai/ui/mention-node-static';

export const BaseMentionKit = [
  BaseMentionPlugin.withComponent(MentionElementStatic),
];
