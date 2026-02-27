/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ErrorCode } from "./ErrorCode";

type AiErrorContext = {
  /** Session id for the request. */
  sessionId?: string;
  /** Workspace id for the request. */
  workspaceId?: string;
  /** Project id for the request. */
  projectId?: string;
  /** Request correlation id. */
  requestId?: string;
  /** Intent or command id. */
  intent?: string;
  /** Response mode for the request. */
  responseMode?: string;
  /** Provider id for the model. */
  provider?: string;
  /** Model id for the request. */
  modelId?: string;
};

export class AiError extends Error {
  /** Stable error code for policy handling. */
  code: ErrorCode;
  /** Optional context for debugging. */
  context?: AiErrorContext;
  /** Optional raw cause for tracing. */
  cause?: unknown;

  /** Create a typed AI error with context. */
  constructor(code: ErrorCode, message: string, context?: AiErrorContext, cause?: unknown) {
    super(message);
    this.code = code;
    this.context = context;
    this.cause = cause;
  }
}
