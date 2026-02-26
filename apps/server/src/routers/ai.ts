import { BaseAiRouter, aiSchemas, t, shieldedProcedure } from "@openloaf/api";
import { storeSecret } from "@/ai/tools/secretStore";

/** Deprecated message for local AI media routes. */
const DEPRECATED_MESSAGE = "已迁移到 SaaS 媒体接口，请使用 /ai/image /ai/vedio";

/** Throw a deprecated error for legacy routes. */
function throwDeprecated(): never {
  throw new Error(DEPRECATED_MESSAGE);
}

export class AiRouterImpl extends BaseAiRouter {
  /** AI tRPC router with deprecated media endpoints. */
  public static createRouter() {
    return t.router({
      /** Store a secret value and return a placeholder token. */
      storeSecret: shieldedProcedure
        .input(aiSchemas.storeSecret.input)
        .output(aiSchemas.storeSecret.output)
        .mutation(async ({ input }) => {
          const token = storeSecret(input.value);
          return { token };
        }),
      textToImage: shieldedProcedure
        .input(aiSchemas.textToImage.input)
        .output(aiSchemas.textToImage.output)
        .mutation(async () => {
          throwDeprecated();
        }),
      inpaint: shieldedProcedure
        .input(aiSchemas.inpaint.input)
        .output(aiSchemas.inpaint.output)
        .mutation(async () => {
          throwDeprecated();
        }),
      materialExtract: shieldedProcedure
        .input(aiSchemas.materialExtract.input)
        .output(aiSchemas.materialExtract.output)
        .mutation(async () => {
          throwDeprecated();
        }),
      videoGenerate: shieldedProcedure
        .input(aiSchemas.videoGenerate.input)
        .output(aiSchemas.videoGenerate.output)
        .mutation(async () => {
          throwDeprecated();
        }),
      videoGenerateResult: shieldedProcedure
        .input(aiSchemas.videoGenerateResult.input)
        .output(aiSchemas.videoGenerateResult.output)
        .mutation(async () => {
          throwDeprecated();
        }),
    });
  }
}

export const aiRouterImplementation = AiRouterImpl.createRouter();
