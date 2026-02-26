import { BaseCommentPlugin } from '@platejs/comment';

import { CommentLeafStatic } from '@openloaf/ui/comment-node-static';

export const BaseCommentKit = [
  BaseCommentPlugin.withComponent(CommentLeafStatic),
];
