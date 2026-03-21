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

// ── Media v2 types ──
export type {
  MediaFeature,
  MediaAspectRatio,
  MediaResolution,
  MediaQuality,
  MediaGenerateBase,
  MediaGenerateRequest,
  ImageGenerateRequest as MediaImageGenerateRequest,
  PosterRequest,
  ImageEditRequest,
  UpscaleRequest as MediaUpscaleRequest,
  OutpaintRequest,
  VideoGenerateRequest as MediaVideoGenerateRequest,
  DigitalHumanRequest,
  TtsRequest,
  // v2 new features (SDK 0.1.13)
  MattingRequest,
  VideoEditRequest,
  MotionTransferRequest,
  MusicRequest,
  SfxRequest,
  MediaTaskItem,
  MediaTaskGroupData,
  MediaTaskGroupSuccess,
  MediaTaskGroupResponse,
  MediaModelsQuery,
} from "@openloaf-saas/sdk";

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

// ── Media v2 payload ──
export type SaasMediaGeneratePayload = import("@openloaf-saas/sdk").MediaGenerateRequest & MediaSubmitContext;
