import { BaseCommentPlugin } from '@platejs/comment';

import { CommentLeafStatic } from '@tenas-ai/ui/comment-node-static';

export const BaseCommentKit = [
  BaseCommentPlugin.withComponent(CommentLeafStatic),
];
