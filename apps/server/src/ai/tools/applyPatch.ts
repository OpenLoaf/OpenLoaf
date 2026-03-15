/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// 逻辑：前后端共享 apply_patch 解析逻辑，避免一边修复后一边遗漏。
export type {
  Hunk,
  UpdateFileChunk,
} from "@openloaf/api/utils/apply-patch-parser";
export {
  applyReplacements,
  computeReplacements,
  parsePatch,
  seekSequence,
} from "@openloaf/api/utils/apply-patch-parser";
