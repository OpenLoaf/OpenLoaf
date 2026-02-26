import { BaseMentionPlugin } from '@platejs/mention';

import { MentionElementStatic } from '@openloaf/ui/mention-node-static';

export const BaseMentionKit = [
  BaseMentionPlugin.withComponent(MentionElementStatic),
];
