/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { BaseAiRouter, aiSchemas, t, shieldedProcedure } from "@openloaf/api";
import { TRPCError } from "@trpc/server";
import { storeSecret } from "@/ai/tools/secretStore";
import { getActiveQuery } from "@/ai/models/cli/claudeCode/activeQueries";

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
      /** Answer a Claude Code AskUserQuestion prompt. */
      answerClaudeCodeQuestion: shieldedProcedure
        .input(aiSchemas.answerClaudeCodeQuestion.input)
        .output(aiSchemas.answerClaudeCodeQuestion.output)
        .mutation(async ({ input }) => {
          const queryHandle = getActiveQuery(input.sessionId);
          if (!queryHandle) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No active Claude Code session",
            });
          }

          const userMessage = {
            type: "user" as const,
            message: {
              role: "user" as const,
              content: [
                {
                  type: "tool_result" as const,
                  tool_use_id: input.toolUseId,
                  content: JSON.stringify(input.answers),
                },
              ],
            },
            parent_tool_use_id: null,
            session_id: input.sessionId,
          };

          await queryHandle.streamInput(
            (async function* () {
              yield userMessage;
            })(),
          );

          return { ok: true };
        }),
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
