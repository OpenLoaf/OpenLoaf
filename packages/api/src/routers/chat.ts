import { publicProcedure, router } from "../index";
import { deepseek } from "@ai-sdk/deepseek";
import { streamText } from "ai";
import { z } from "zod";

export const chatRouter = router({
  stream: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string(),
          })
        ),
      })
    )
    .subscription(async function* ({ input }) {
      const abortController = new AbortController();

      try {
        const stream = await streamText({
          model: deepseek("deepseek-chat"),
          messages: input.messages,
          abortSignal: abortController.signal,
        });

        for await (const delta of stream.textStream) {
          yield delta;
        }
      } finally {
        abortController.abort();
      }
    }),
});
