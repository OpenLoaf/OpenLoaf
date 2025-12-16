import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { SystemToolResult } from "./types";
import { resolveInAllowedRoots, readUtf8FileWithLimit } from "./utils";

/**
 * 读取文件（只读）
 * - 用途：让模型读取本项目允许范围内的提示词/模板/文档片段。
 * - 安全：MVP 仅允许读取白名单目录 + 限制文件大小。
 */
export const fileReadTool = tool({
  description: "读取指定文件的内容，返回UTF-8编码的文本。适用于需要访问项目内提示词、模板或文档片段的场景。仅允许读取白名单目录下的文件，并有文件大小限制。",
  inputSchema: zodSchema(
    z.object({
      path: z
        .string()
        .describe(
          "文件路径（相对或绝对）。仅允许访问白名单目录：apps/server/src/chat、apps/server/prompts、docs。",
        ),
    }),
  ),
  execute: async (input): Promise<SystemToolResult<{ path: string; text: string }>> => {
    try {
      const allowedRoots = [
        "apps/server/src/chat",
        "apps/server/prompts",
        "docs",
      ];

      const absolutePath = resolveInAllowedRoots({
        baseDir: process.cwd(),
        filePath: input.path,
        allowedRoots,
      });

      const text = await readUtf8FileWithLimit({
        absolutePath,
        maxBytes: 256 * 1024,
      });

      return { ok: true, data: { path: absolutePath, text } };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message:
            err instanceof Error ? err.message : "读取文件失败（未知错误）。",
          riskType: "read",
        },
      };
    }
  },
});
