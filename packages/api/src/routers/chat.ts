import { publicProcedure, router } from "../index";
import { deepseek } from "@ai-sdk/deepseek";
import { streamText } from "ai";
import { z } from "zod";

export const chatRouter = router({
  chat: publicProcedure
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
    .mutation(async ({ input }) => {
      // 执行模型并返回流式响应
      const stream = await streamText({
        model: deepseek("deepseek-chat"),
        messages: input.messages,
      });

      // 将流转换为文本流式响应
      return stream.toTextStreamResponse();
    }),
});
