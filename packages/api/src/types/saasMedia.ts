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
  AiAudioRequest,
  AiTaskResponse,
  AiTaskCancelResponse,
  AiModelsResponse,
  AiModel,
  AiMediaInput,
  AiImageInputs,
  AiVideoInputs,
  AiImageOutput,
  AiVideoOutput,
  AiAudioOutput,
} from "@openloaf-saas/sdk";

export type {
  AiImageRequest,
  AiVideoRequest,
  AiAudioRequest,
  AiTaskResponse,
  AiTaskCancelResponse,
  AiModelsResponse,
  AiModel,
  AiMediaInput,
  AiImageInputs,
  AiVideoInputs,
  AiImageOutput,
  AiVideoOutput,
  AiAudioOutput,
};

export type MediaSubmitContext = {
  /** Project id for storage scoping. */
  projectId?: string;
  /** Save directory relative to the project or global root. */
  saveDir?: string;
  /** Source node id for tracing. */
  sourceNodeId?: string;
};

export type SaasImageSubmitPayload = AiImageRequest & MediaSubmitContext;
export type SaasVideoSubmitPayload = AiVideoRequest & MediaSubmitContext;
export type SaasAudioSubmitPayload = AiAudioRequest & MediaSubmitContext;
