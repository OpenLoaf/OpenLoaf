import type { ModelParameterDefinition, ModelParameterFeature } from "./modelTypes";

export type MediaModelTag =
  | "image_generation"
  | "video_generation"
  | "image_input"
  | "image_multi_input"
  | "image_edit"
  | "video_reference"
  | "video_start_end"
  | "image_multi_output"
  | "video_audio_output";

export type MediaModelCapabilities = {
  /** Common capability metadata. */
  common?: {
    /** Maximum context window (K). */
    maxContextK?: number;
  };
  /** Input capabilities for the model. */
  input?: {
    /** Maximum number of images supported. */
    maxImages?: number;
    /** Whether mask-based editing is supported. */
    supportsMask?: boolean;
    /** Whether reference video input is supported. */
    supportsReferenceVideo?: boolean;
    /** Whether start/end frame input is supported. */
    supportsStartEnd?: boolean;
  };
  /** Output capabilities for the model. */
  output?: {
    /** Whether multiple outputs are supported. */
    supportsMulti?: boolean;
    /** Whether audio output is supported. */
    supportsAudio?: boolean;
  };
  /** User configurable parameters. */
  params?: {
    /** Feature flags for canvas behaviors. */
    features: ModelParameterFeature[];
    /** Field definitions for UI and validation. */
    fields: ModelParameterDefinition[];
  };
};

export type MediaModelDefinition = {
  /** Unique model id. */
  id: string;
  /** Display name for UI. */
  name?: string;
  /** Model family id. */
  familyId?: string;
  /** Provider id owning the model. */
  providerId?: string;
  /** Tags for filtering. */
  tags?: MediaModelTag[];
  /** Structured capability metadata. */
  capabilities?: MediaModelCapabilities;
};
