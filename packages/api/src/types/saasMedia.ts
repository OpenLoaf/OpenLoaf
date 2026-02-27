/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  AiImageRequest,
  AiVideoRequest,
  AiTaskResponse,
  AiTaskCancelResponse,
  AiModelsResponse,
  AiModel,
  AiMediaInput,
  AiImageInputs,
  AiVideoInputs,
  AiImageOutput,
  AiVideoOutput,
} from "@openloaf-saas/sdk";

export type {
  AiImageRequest,
  AiVideoRequest,
  AiTaskResponse,
  AiTaskCancelResponse,
  AiModelsResponse,
  AiModel,
  AiMediaInput,
  AiImageInputs,
  AiVideoInputs,
  AiImageOutput,
  AiVideoOutput,
};

export type MediaSubmitContext = {
  /** Workspace id for storage scoping. */
  workspaceId?: string;
  /** Project id for storage scoping. */
  projectId?: string;
  /** Save directory relative to project/workspace. */
  saveDir?: string;
  /** Source node id for tracing. */
  sourceNodeId?: string;
};

export type SaasImageSubmitPayload = AiImageRequest & MediaSubmitContext;
export type SaasVideoSubmitPayload = AiVideoRequest & MediaSubmitContext;
