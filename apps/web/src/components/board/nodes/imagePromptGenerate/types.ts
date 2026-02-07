import { z } from "zod";

export type ImagePromptGenerateNodeProps = {
  /** Selected chatModelId (profileId:modelId). */
  chatModelId?: string;
  /** Generated result text. */
  resultText?: string;
  /** Error text for failed runs. */
  errorText?: string;
};

/** Schema for image prompt generation node props. */
export const ImagePromptGenerateNodeSchema = z.object({
  chatModelId: z.string().optional(),
  resultText: z.string().optional(),
  errorText: z.string().optional(),
});
