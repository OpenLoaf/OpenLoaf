import { BaseAiRouter, aiSchemas, t, shieldedProcedure } from "@teatime-ai/api";
import {
  submitDreaminaTask,
  submitDreaminaInpaintTask,
  submitDreaminaMaterialExtractionTask,
} from "@/ai/models/dreamina-ai/dreaminaImage";
import { submitDreaminaVideoTask } from "@/ai/models/dreamina-ai/dreaminaVideo";

export class AiRouterImpl extends BaseAiRouter {
  /** AI tRPC 端点实现：调用 Dreamina 能力。 */
  public static createRouter() {
    return t.router({
      textToImage: shieldedProcedure
        .input(aiSchemas.textToImage.input)
        .output(aiSchemas.textToImage.output)
        .mutation(async ({ input }) => {
          const result = await submitDreaminaTask({
            prompt: input.prompt,
            imageUrls: input.imageUrls,
            size: input.size,
            width: input.width,
            height: input.height,
            scale: input.scale,
            forceSingle: input.forceSingle,
            minRatio: input.minRatio,
            maxRatio: input.maxRatio,
            seed: input.seed,
          });
          return { taskId: result.taskId };
        }),
      inpaint: shieldedProcedure
        .input(aiSchemas.inpaint.input)
        .output(aiSchemas.inpaint.output)
        .mutation(async ({ input }) => {
          const result = await submitDreaminaInpaintTask({
            imageUrls: input.imageUrls,
            binaryDataBase64: input.binaryDataBase64,
            prompt: input.prompt,
            seed: input.seed,
          });
          return { taskId: result.taskId };
        }),
      materialExtract: shieldedProcedure
        .input(aiSchemas.materialExtract.input)
        .output(aiSchemas.materialExtract.output)
        .mutation(async ({ input }) => {
          const result = await submitDreaminaMaterialExtractionTask({
            imageUrls: input.imageUrls,
            binaryDataBase64: input.binaryDataBase64,
            imageEditPrompt: input.imageEditPrompt,
            loraWeight: input.loraWeight,
            width: input.width,
            height: input.height,
            seed: input.seed,
          });
          return { taskId: result.taskId };
        }),
      videoGenerate: shieldedProcedure
        .input(aiSchemas.videoGenerate.input)
        .output(aiSchemas.videoGenerate.output)
        .mutation(async ({ input }) => {
          const result = await submitDreaminaVideoTask({
            prompt: input.prompt,
            imageUrls: input.imageUrls,
            binaryDataBase64: input.binaryDataBase64,
            seed: input.seed,
            frames: input.frames,
            aspectRatio: input.aspectRatio,
          });
          return { taskId: result.taskId };
        }),
    });
  }
}

export const aiRouterImplementation = AiRouterImpl.createRouter();
