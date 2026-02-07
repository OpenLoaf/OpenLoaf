import { z } from "zod";

export type ImageGenerateNodeProps = {
  /** Selected SaaS model id. */
  modelId?: string;
  /** Legacy chat model id for migration. */
  chatModelId?: string;
  /** Local prompt text entered in the node. */
  promptText?: string;
  /** Style prompt for image generation. */
  style?: string;
  /** Negative prompt text. */
  negativePrompt?: string;
  /** Output aspect ratio for generated images. */
  outputAspectRatio?: string;
  /** Requested output image count. */
  outputCount?: number;
  /** Model parameters. */
  parameters?: Record<string, string | number | boolean>;
  /** Generated image urls. */
  resultImages?: string[];
  /** Error text for failed runs. */
  errorText?: string;
};

/** Schema for image generation node props. */
export const ImageGenerateNodeSchema = z.object({
  modelId: z.string().optional(),
  chatModelId: z.string().optional(),
  promptText: z.string().optional(),
  style: z.string().optional(),
  negativePrompt: z.string().optional(),
  outputAspectRatio: z.string().optional(),
  outputCount: z.number().optional(),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  resultImages: z.array(z.string()).optional(),
  errorText: z.string().optional(),
});
