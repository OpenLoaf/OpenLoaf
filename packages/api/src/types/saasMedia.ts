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
} from "@tenas-saas/sdk";

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
