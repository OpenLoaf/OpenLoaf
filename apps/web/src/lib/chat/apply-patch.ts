/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// 逻辑：StreamingCodeViewer 与 server 共用同一份 patch 解析逻辑，避免行为漂移。
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
