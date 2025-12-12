import { tool, zodSchema } from "ai";
import { z } from "zod";
import { notImplemented } from "./types";

/**
 * Shell 工具（MVP）
 * - read：只读命令（建议后续做 allowlist）
 * - write/destructive：必须 human-in-the-loop（这里只占位，不执行）
 */

export const shellReadonlyTool = tool({
  description:
    "【system/read】执行只读 shell 命令并返回输出。注意：当前为 MVP 占位，不执行任何命令。",
  inputSchema: zodSchema(
    z.object({
      cmd: z.string().describe("要执行的命令（只读命令）"),
    }),
  ),
  execute: async (_input, _options) => notImplemented("read"),
});

export const shellWriteTool = tool({
  description:
    "【system/write】执行可能修改系统/文件的 shell 命令（需要审批）。当前为 MVP 占位，不执行。",
  inputSchema: zodSchema(
    z.object({
      cmd: z.string().describe("要执行的命令（可能修改系统/文件）"),
    }),
  ),
  // AI SDK v6 内置审批机制：需要审批时会触发 tool-approval-request（后续再接 UI）。
  needsApproval: true,
  execute: async (_input, _options) => notImplemented("write"),
});

export const shellDestructiveTool = tool({
  description:
    "【system/destructive】执行破坏性 shell 命令（需要审批）。当前为 MVP 占位，不执行。",
  inputSchema: zodSchema(
    z.object({
      cmd: z.string().describe("要执行的命令（破坏性）"),
    }),
  ),
  needsApproval: true,
  execute: async (_input, _options) => notImplemented("destructive"),
});
