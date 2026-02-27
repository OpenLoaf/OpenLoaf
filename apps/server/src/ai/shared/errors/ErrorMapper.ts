/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AiError } from "./AiError";

/** Map internal error to user-facing message. */
export function mapErrorToMessage(error: AiError | unknown): string {
  if (error instanceof Error) return error.message;
  return "请求失败：发生未知错误。";
}
