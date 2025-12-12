import { tool, zodSchema } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import type { SystemToolResult } from "./types";
import {
  parseSimpleCommand,
  resolveInAllowedRoots,
  runCommandReadonly,
} from "./utils";

/**
 * Shell 工具（MVP）
 * - read：只读命令（建议后续做 allowlist）
 * - write/destructive：必须 human-in-the-loop（这里只占位，不执行）
 */

export const shellReadonlyTool = tool({
  description:
    "【system/read】执行只读 shell 命令并返回输出。MVP：仅允许 date/uname/whoami/pwd/ls，禁止管道/重定向。",
  inputSchema: zodSchema(
    z.object({
      cmd: z
        .string()
        .describe(
          "要执行的命令。MVP allowlist：date、uname、whoami、pwd、ls。禁止 | ; && > 等。",
        ),
    }),
  ),
  execute: async (input): Promise<
    SystemToolResult<{ stdout: string; stderr: string; exitCode: number }>
  > => {
    try {
      const parts = parseSimpleCommand(input.cmd);
      const command = parts[0]!;

      // MVP：严格 allowlist，避免模型“误用”命令造成信息泄露或副作用
      const allowNoArgs = new Set(["date", "uname", "whoami", "pwd"]);
      if (allowNoArgs.has(command)) {
        if (parts.length !== 1) {
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: `${command} 在 MVP 模式下不允许带参数。`,
              riskType: "read",
            },
          };
        }
        const result = await runCommandReadonly({
          cmd: [command],
        });
        return { ok: true, data: truncateCommandOutput(result) };
      }

      if (command === "ls") {
        // 允许：ls、ls -l、ls -a、ls -la、ls <path>
        const flags = new Set(["-l", "-a", "-la"]);
        const args: string[] = [];
        const paths: string[] = [];
        for (const arg of parts.slice(1)) {
          if (arg.startsWith("-")) {
            if (!flags.has(arg)) {
              return {
                ok: false,
                error: {
                  code: "INVALID_INPUT",
                  message: `ls 不支持该参数：${arg}`,
                  riskType: "read",
                },
              };
            }
            args.push(arg);
            continue;
          }
          paths.push(arg);
        }

        // MVP：仅允许在白名单目录里 ls
        const allowedRoots = [
          "apps/server/src/chat",
          "apps/server/prompts",
          "docs",
        ];
        const baseDir = process.cwd();
        const cwd = baseDir;

        const target =
          paths[0] ??
          "."; /* 未给路径时，按 cwd 列出，但 cwd 也必须在白名单 */
        const resolvedTarget = resolveInAllowedRoots({
          baseDir: cwd,
          filePath: target,
          allowedRoots,
        });

        const result = await runCommandReadonly({
          cmd: ["ls", ...args, resolvedTarget],
        });
        return { ok: true, data: truncateCommandOutput(result) };
      }

      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `不支持的只读命令：${command}（MVP allowlist 限制）。`,
          riskType: "read",
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message: err instanceof Error ? err.message : "命令执行失败（未知错误）。",
          riskType: "read",
        },
      };
    }
  },
});

export const shellWriteTool = tool({
  description:
    "【system/write】执行可能修改文件系统的命令（需要审批）。MVP：仅支持 mkdir <path>（白名单目录内）。",
  inputSchema: zodSchema(
    z.object({
      cmd: z
        .string()
        .describe(
          "要执行的命令。MVP allowlist：mkdir <path>。路径必须在白名单目录内。",
        ),
    }),
  ),
  // AI SDK v6 内置审批机制：需要审批时会触发 tool-approval-request（后续再接 UI）。
  needsApproval: true,
  execute: async (input): Promise<SystemToolResult<{ ok: true }>> => {
    try {
      const parts = parseSimpleCommand(input.cmd);
      const command = parts[0];
      const allowedRoots = ["apps/server/src/chat"];

      if (command !== "mkdir") {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: `不支持的写入命令：${command}（MVP allowlist 限制）。`,
            riskType: "write",
          },
        };
      }

      const target = parts[1];
      if (!target) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "mkdir 缺少目标路径参数。",
            riskType: "write",
          },
        };
      }

      const absolutePath = resolveInAllowedRoots({
        baseDir: process.cwd(),
        filePath: target,
        allowedRoots,
      });

      await fs.mkdir(absolutePath, { recursive: true });

      return { ok: true, data: { ok: true } };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message:
            err instanceof Error ? err.message : "写入操作失败（未知错误）。",
          riskType: "write",
        },
      };
    }
  },
});

export const shellDestructiveTool = tool({
  description:
    "【system/destructive】执行破坏性命令（需要审批）。MVP：仅支持 rm <file>（白名单目录内，且只能删文件）。",
  inputSchema: zodSchema(
    z.object({
      cmd: z
        .string()
        .describe(
          "要执行的命令。MVP allowlist：rm <file>。路径必须在白名单目录内，且只能删除文件。",
        ),
    }),
  ),
  needsApproval: true,
  execute: async (input): Promise<SystemToolResult<{ ok: true }>> => {
    try {
      const parts = parseSimpleCommand(input.cmd);
      const command = parts[0];
      const allowedRoots = ["apps/server/src/chat"];

      if (command !== "rm") {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: `不支持的破坏性命令：${command}（MVP allowlist 限制）。`,
            riskType: "destructive",
          },
        };
      }

      const target = parts[1];
      if (!target) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "rm 缺少目标路径参数。",
            riskType: "destructive",
          },
        };
      }

      const absolutePath = resolveInAllowedRoots({
        baseDir: process.cwd(),
        filePath: target,
        allowedRoots,
      });

      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "MVP 仅允许删除文件，不允许删除目录。",
            riskType: "destructive",
          },
        };
      }

      await fs.unlink(absolutePath);

      return { ok: true, data: { ok: true } };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message:
            err instanceof Error ? err.message : "删除操作失败（未知错误）。",
          riskType: "destructive",
        },
      };
    }
  },
});

function truncateCommandOutput(result: {
  stdout: string;
  stderr: string;
  exitCode: number;
}): { stdout: string; stderr: string; exitCode: number } {
  // MVP：限制返回长度，避免输出过大拖慢对话/污染上下文
  const MAX_CHARS = 8_000;
  return {
    exitCode: result.exitCode,
    stdout:
      result.stdout.length > MAX_CHARS
        ? result.stdout.slice(0, MAX_CHARS) + "\n...<truncated>"
        : result.stdout,
    stderr:
      result.stderr.length > MAX_CHARS
        ? result.stderr.slice(0, MAX_CHARS) + "\n...<truncated>"
        : result.stderr,
  };
}
