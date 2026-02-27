/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type ImageGenerateOptions = {
  /** Number of images to generate. */
  n?: number;
  /** Image size in "{width}x{height}" format. */
  size?: string;
  /** Image aspect ratio in "{width}:{height}" format. */
  aspectRatio?: string;
  /** Random seed for reproducible output. */
  seed?: number;
  /** Provider-specific image options. */
  providerOptions?: {
    /** OpenAI image options. */
    openai?: {
      /** Image quality (e.g. "standard", "hd"). */
      quality?: string;
      /** Image style (e.g. "vivid", "natural"). */
      style?: string;
    };
    /** Volcengine image options. */
    volcengine?: {
      /** Prompt influence scale (0-1). */
      scale?: number;
      /** Force single image output. */
      forceSingle?: boolean;
      /** Minimum width/height ratio. */
      minRatio?: number;
      /** Maximum width/height ratio. */
      maxRatio?: number;
      /** Image area size (width * height). */
      size?: number;
    };
    /** Qwen image options. */
    qwen?: {
      /** Negative prompt text. */
      negative_prompt?: string;
      /** Whether to extend prompt. */
      prompt_extend?: boolean;
      /** Whether to add watermark. */
      watermark?: boolean;
      /** Enable interleave mode (wan2.6-image). */
      enable_interleave?: boolean;
      /** Stream response (wan2.6-image). */
      stream?: boolean;
      /** Max images for interleave mode (wan2.6-image). */
      max_images?: number;
    };
  };
};

export type OpenLoafImageMetadataV1 = {
  /** Schema version. */
  version: 1;
  /** Chat session id. */
  chatSessionId: string;
  /** Prompt text sent to the model. */
  prompt: string;
  /** Revised prompt from provider. */
  revised_prompt?: string;
  /** Resolved model id without source prefix. */
  modelId: string;
  /** Raw chat model id (may include source prefix). */
  chatModelId?: string;
  /** Model source marker. */
  modelSource?: "local" | "cloud";
  /** Provider id used to resolve model. */
  providerId?: string;
  /** Workspace id for storage scope. */
  workspaceId?: string;
  /** Project id for storage scope. */
  projectId?: string;
  /** Board id for board scope. */
  boardId?: string;
  /** Trigger source for the request. */
  trigger?: string;
  /** Request message id. */
  requestMessageId?: string;
  /** Response message id. */
  responseMessageId?: string;
  /** Created time in ISO format. */
  createdAt: string;
  /** Image generation options. */
  imageOptions?: {
    /** Number of images requested. */
    n?: number;
    /** Image size in "{width}x{height}". */
    size?: string;
    /** Image aspect ratio in "{width}:{height}". */
    aspectRatio?: string;
  };
  /** Sanitized request payload. */
  request?: {
    /** Sanitized parts from the latest user message. */
    parts?: Array<{
      /** Part type. */
      type: string;
      /** Text payload. */
      text?: string;
      /** Url payload. */
      url?: string;
      /** Media type hint. */
      mediaType?: string;
    }>;
    /** Raw metadata from the user message. */
    metadata?: unknown;
  };
  /** Metadata flags. */
  flags?: {
    /** Whether metadata was truncated. */
    truncated?: boolean;
    /** Whether data urls were omitted. */
    hasDataUrlOmitted?: boolean;
    /** Whether binary payloads were omitted. */
    hasBinaryOmitted?: boolean;
  };
  /** Warning messages captured during serialization. */
  warnings?: string[];
};
