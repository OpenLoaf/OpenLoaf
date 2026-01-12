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
  };
};
