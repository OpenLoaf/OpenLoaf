import { BaseAiRouter, aiSchemas, t, shieldedProcedure } from "@tenas-ai/api";
import { runProviderRequest } from "@/ai/models/providerRequestRunner";

/** Default provider id for AI media tasks. */
const VOLCENGINE_PROVIDER_ID = "volcengine";
/** Default model ids for each AI task kind. */
const VOLCENGINE_MODEL_IDS = {
  textToImage: "jimeng_t2i_v40",
  inpaint: "jimeng_image2image_dream_inpaint",
  materialExtract: "i2i_material_extraction",
  videoGenerate: "jimeng_ti2v_v30_pro",
} as const;

export class AiRouterImpl extends BaseAiRouter {
  /** AI tRPC 端点实现：调用 Dreamina 能力。 */
  public static createRouter() {
    return t.router({
      textToImage: shieldedProcedure
        .input(aiSchemas.textToImage.input)
        .output(aiSchemas.textToImage.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.textToImage,
            input: { kind: "textToImage", payload: input },
          });
          return { taskId: result.taskId };
        }),
      inpaint: shieldedProcedure
        .input(aiSchemas.inpaint.input)
        .output(aiSchemas.inpaint.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.inpaint,
            input: { kind: "inpaint", payload: input },
          });
          return { taskId: result.taskId };
        }),
      materialExtract: shieldedProcedure
        .input(aiSchemas.materialExtract.input)
        .output(aiSchemas.materialExtract.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.materialExtract,
            input: { kind: "materialExtract", payload: input },
          });
          return { taskId: result.taskId };
        }),
      videoGenerate: shieldedProcedure
        .input(aiSchemas.videoGenerate.input)
        .output(aiSchemas.videoGenerate.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.videoGenerate,
            input: { kind: "videoGenerate", payload: input },
          });
          return { taskId: result.taskId };
        }),
    });
  }
}

export const aiRouterImplementation = AiRouterImpl.createRouter();
