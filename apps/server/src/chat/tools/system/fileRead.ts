import { tool, zodSchema } from "ai";
import { RiskType, type SystemToolResult } from "@teatime-ai/api/types/toolResult";
import { resolveInAllowedRoots, readUtf8FileWithLimit } from "./utils";
import { fileReadToolDef } from "@teatime-ai/api/types/tools/system";

/**
 * 读取文件（只读）
 * - 用途：让模型读取本项目允许范围内的提示词/模板/文档片段。
 * - 安全：MVP 仅允许读取白名单目录 + 限制文件大小。
 */
export const fileReadTool = tool({
  description: fileReadToolDef.description,
  inputSchema: zodSchema(fileReadToolDef.parameters),
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
          riskType: RiskType.Read,
        },
      };
    }
  },
});
