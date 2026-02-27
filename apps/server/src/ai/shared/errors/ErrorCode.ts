/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type ErrorCode =
  | "invalid_request"
  | "missing_session"
  | "missing_last_message"
  | "model_not_found"
  | "model_build_failed"
  | "image_request_invalid"
  | "image_generation_failed"
  | "message_save_failed"
  | "permission_denied"
  | "unknown_error";
