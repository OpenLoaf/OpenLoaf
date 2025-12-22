import { tool, zodSchema } from "ai";
import fs from "node:fs/promises";
import { RiskType, type SystemToolResult } from "@teatime-ai/api/types/toolResult";
import {
  parseSimpleCommand,
  resolveInAllowedRoots,
  runCommandReadonly,
} from "./utils";
import { getSessionId } from "@/common/requestContext";
import { logger } from "@/common/logger";
import {
  shellReadonlyToolDef,
  shellWriteToolDef,
  shellDestructiveToolDef,
  shellReadonlyAllowNoArgs,
  shellReadonlyLsAllowedFlags,
  shellReadonlyLsAllowedRoots,
  shellWriteAllowedCommand,
  shellWriteAllowedRoots,
  shellDestructiveAllowedCommand,
  shellDestructiveAllowedRoots,
} from "@teatime-ai/api/types/tools/system";

/**
 * Shell 工具（MVP）
 * - read：只读命令（建议后续做 allowlist）
 * - write/destructive：必须 human-in-the-loop（这里只占位，不执行）
 */

export const shellReadonlyTool = tool({
  description: shellReadonlyToolDef.description,
  inputSchema: zodSchema(shellReadonlyToolDef.parameters),
  execute: async (
    input
  ): Promise<
    SystemToolResult<{ stdout: string; stderr: string; exitCode: number }>
  > => {
    try {
      // 保留 sessionId 便于排查工具调用来源。
      const sessionId = getSessionId();
      if (sessionId) logger.debug({ sessionId }, "当前请求上下文");

      const parts = parseSimpleCommand(input.cmd);
      const command = parts[0]!;

      // MVP：严格 allowlist，避免模型“误用”命令造成信息泄露或副作用
      const allowNoArgs = new Set<string>(shellReadonlyAllowNoArgs);
      if (allowNoArgs.has(command)) {
        if (parts.length !== 1) {
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: `${command} 在 MVP 模式下不允许带参数。`,
              riskType: RiskType.Read,
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
        const flags = new Set<string>(shellReadonlyLsAllowedFlags);
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
                  riskType: RiskType.Read,
                },
              };
            }
            args.push(arg);
            continue;
          }
          paths.push(arg);
        }

        // MVP：仅允许在白名单目录里 ls
        const allowedRoots = [...shellReadonlyLsAllowedRoots];
        const baseDir = process.cwd();
        const cwd = baseDir;

        const target =
          paths[0] ?? "."; /* 未给路径时，按 cwd 列出，但 cwd 也必须在白名单 */
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
          riskType: RiskType.Read,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message:
            err instanceof Error ? err.message : "命令执行失败（未知错误）。",
          riskType: RiskType.Read,
        },
      };
    }
  },
});

export const shellWriteTool = tool({
  description: shellWriteToolDef.description,
  inputSchema: zodSchema(shellWriteToolDef.parameters),
  // AI SDK v6 内置审批机制：需要审批时会触发 tool-approval-request（后续再接 UI）。
  needsApproval: true,
  execute: async (input): Promise<SystemToolResult<{ ok: true }>> => {
    try {
      const parts = parseSimpleCommand(input.cmd);
      const command = parts[0];
      const allowedRoots = [...shellWriteAllowedRoots];

      if (command !== shellWriteAllowedCommand) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: `不支持的写入命令：${command}（MVP allowlist 限制）。`,
            riskType: RiskType.Write,
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
            riskType: RiskType.Write,
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
          riskType: RiskType.Write,
        },
      };
    }
  },
});

export const shellDestructiveTool = tool({
  description: shellDestructiveToolDef.description,
  inputSchema: zodSchema(shellDestructiveToolDef.parameters),
  needsApproval: true,
  execute: async (input): Promise<SystemToolResult<{ ok: true }>> => {
    try {
      const parts = parseSimpleCommand(input.cmd);
      const command = parts[0];
      const allowedRoots = [...shellDestructiveAllowedRoots];

      if (command !== shellDestructiveAllowedCommand) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: `不支持的破坏性命令：${command}（MVP allowlist 限制）。`,
            riskType: RiskType.Destructive,
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
            riskType: RiskType.Destructive,
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
            riskType: RiskType.Destructive,
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
          riskType: RiskType.Destructive,
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
