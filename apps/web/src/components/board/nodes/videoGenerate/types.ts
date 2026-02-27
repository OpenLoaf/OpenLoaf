/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export type VideoGenerateNodeProps = {
  /** Selected SaaS model id. */
  modelId?: string;
  /** Legacy chat model id for migration. */
  chatModelId?: string;
  /** Prompt text entered in the node. */
  promptText?: string;
  /** Negative prompt text. */
  negativePrompt?: string;
  /** Style prompt for video generation. */
  style?: string;
  /** Legacy duration in seconds. */
  durationSeconds?: number;
  /** Legacy aspect ratio preset value. */
  aspectRatio?: string;
  /** Whether to filter models that support audio output. */
  outputAudio?: boolean;
  /** Model parameters. */
  parameters?: Record<string, string | number | boolean>;
  /** Generated video path. */
  resultVideo?: string;
  /** Error text for failed runs. */
  errorText?: string;
};

/** Schema for video generation node props. */
export const VideoGenerateNodeSchema = z.object({
  modelId: z.string().optional(),
  chatModelId: z.string().optional(),
  promptText: z.string().optional(),
  negativePrompt: z.string().optional(),
  style: z.string().optional(),
  durationSeconds: z.number().optional(),
  aspectRatio: z.string().optional(),
  outputAudio: z.boolean().optional(),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  resultVideo: z.string().optional(),
  errorText: z.string().optional(),
});
