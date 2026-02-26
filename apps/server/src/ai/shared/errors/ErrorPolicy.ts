/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { mapErrorToMessage } from "./ErrorMapper";

type ErrorPolicyResult = {
  /** HTTP status for the error. */
  status: number;
  /** User-facing error message. */
  message: string;
};

/** Normalize unknown errors to HTTP responses. */
export function toHttpError(error: unknown, fallbackStatus = 500): ErrorPolicyResult {
  return { status: fallbackStatus, message: mapErrorToMessage(error) };
}
