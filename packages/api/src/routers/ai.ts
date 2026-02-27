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
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

export const aiSchemas = {
  // 逻辑：用于在服务端暂存敏感值并返回占位符 token。
  storeSecret: {
    input: z.object({
      value: z.string().min(1),
    }),
    output: z.object({
      token: z.string().min(1),
    }),
  },
  textToImage: {
    input: z.object({
      prompt: z.string().min(1),
      imageUrls: z.array(z.string().min(1)).optional(),
      size: z.number().int().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      scale: z.number().optional(),
      forceSingle: z.boolean().optional(),
      minRatio: z.number().optional(),
      maxRatio: z.number().optional(),
      seed: z.number().int().optional(),
    }),
    output: z.object({ taskId: z.string().min(1) }),
  },
  inpaint: {
    input: z.object({
      imageUrls: z.array(z.string().min(1)).optional(),
      binaryDataBase64: z.array(z.string().min(1)).optional(),
      prompt: z.string().min(1),
      seed: z.number().int().optional(),
    }),
    output: z.object({ taskId: z.string().min(1) }),
  },
  materialExtract: {
    input: z.object({
      imageUrls: z.array(z.string().min(1)).optional(),
      binaryDataBase64: z.array(z.string().min(1)).optional(),
      imageEditPrompt: z.string().min(1),
      loraWeight: z.number().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      seed: z.number().int().optional(),
    }),
    output: z.object({ taskId: z.string().min(1) }),
  },
  videoGenerate: {
    input: z.object({
      prompt: z.string().optional(),
      imageUrls: z.array(z.string().min(1)).optional(),
      binaryDataBase64: z.array(z.string().min(1)).optional(),
      seed: z.number().int().optional(),
      frames: z.number().int().optional(),
      aspectRatio: z.string().optional(),
      parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      chatModelId: z.string().optional(),
      workspaceId: z.string().optional(),
      projectId: z.string().optional(),
    }),
    output: z.object({ taskId: z.string().min(1) }),
  },
  videoGenerateResult: {
    input: z.object({
      taskId: z.string().min(1),
      chatModelId: z.string().optional(),
      workspaceId: z.string().optional(),
      projectId: z.string().optional(),
      saveDir: z.string().optional(),
    }),
    output: z.object({
      status: z.enum(["in_queue", "generating", "done", "not_found", "expired", "failed"]),
      videoUrl: z.string().optional(),
      savedPath: z.string().optional(),
      fileName: z.string().optional(),
    }),
  },
};

export abstract class BaseAiRouter {
  public static routeName = "ai";

  /** Define the ai router contract. */
  public static createRouter() {
    return t.router({
      /** Store a secret value and return a placeholder token. */
      storeSecret: shieldedProcedure
        .input(aiSchemas.storeSecret.input)
        .output(aiSchemas.storeSecret.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      textToImage: shieldedProcedure
        .input(aiSchemas.textToImage.input)
        .output(aiSchemas.textToImage.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      inpaint: shieldedProcedure
        .input(aiSchemas.inpaint.input)
        .output(aiSchemas.inpaint.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      materialExtract: shieldedProcedure
        .input(aiSchemas.materialExtract.input)
        .output(aiSchemas.materialExtract.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      videoGenerate: shieldedProcedure
        .input(aiSchemas.videoGenerate.input)
        .output(aiSchemas.videoGenerate.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      videoGenerateResult: shieldedProcedure
        .input(aiSchemas.videoGenerateResult.input)
        .output(aiSchemas.videoGenerateResult.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const aiRouter = BaseAiRouter.createRouter();
export type AiRouter = typeof aiRouter;
