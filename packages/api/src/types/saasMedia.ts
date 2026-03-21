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

// ── Media v2 payload ──
export type SaasMediaGeneratePayload = import("@openloaf-saas/sdk").MediaGenerateRequest & MediaSubmitContext;

// ── Media v3 types ──

export type V3Feature = {
  id: string
  displayName: string
  variants: V3Variant[]
}

export type V3Variant = {
  id: string
  displayName: string
  creditsPerCall: number
  minMembershipLevel: 'free' | 'lite' | 'pro' | 'premium' | 'infinity'
  capabilities?: Record<string, unknown>
}

export type V3CapabilitiesData = {
  category: 'image' | 'video' | 'audio'
  features: V3Feature[]
  updatedAt: string
}

export type V3GenerateRequest = {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  count?: number
  seed?: number
}

export type V3TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type V3TaskResult = {
  taskId: string
  status: V3TaskStatus
  resultUrls?: string[]
  creditsConsumed?: number
  error?: { code?: string; message?: string }
}
