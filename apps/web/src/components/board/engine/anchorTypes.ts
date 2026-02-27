/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Node types that use large anchors in the board. */
export const LARGE_ANCHOR_NODE_TYPES = new Set([
  "group",
  "image-group",
  "image",
  "image_prompt_generate",
  "video",
  "text",
  "video_generate",
]);
