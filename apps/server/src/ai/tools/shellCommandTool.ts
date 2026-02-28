/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { spawn } from "node:child_process";
import { tool, zodSchema } from "ai";
import { shellCommandToolDef } from "@openloaf/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { resolveToolWorkdir } from "@/ai/tools/toolScope";
import { buildExecEnv, formatFreeformOutput } from "@/ai/tools/execUtils";
import { needsApprovalForCommand } from "@/ai/tools/commandApproval";

type ShellCommandInput = {
  /** Shell command string. */
  command: string;
  /** Whether to run as login shell. */
  login?: boolean;
};

/** Build shell command arguments from shell_command input. */
function buildShellCommand(input: ShellCommandInput): { file: string; args: string[] } {
  const trimmed = input.command.trim();
  if (!trimmed) throw new Error("command is required.");
  if (process.platform === "win32") {
    const args: string[] = [];
    if (input.login === false) args.push("-NoProfile");
    args.push("-Command", trimmed);
    return { file: "powershell.exe", args };
  }
  const resolvedShell = process.env.SHELL || "/bin/sh";
  const args: string[] = [(input.login ?? true) ? "-lc" : "-c", trimmed];
  return { file: resolvedShell, args };
}

/** Execute a one-shot shell command with scope enforcement. */
export const shellCommandTool = tool({
  description: shellCommandToolDef.description,
  inputSchema: zodSchema(shellCommandToolDef.parameters),
  inputExamples: [
    {
      input: {
        actionName: '列出项目中的 TypeScript 文件',
        command: 'find src -name "*.ts" | head -20',
        workdir: '/home/user/project',
      },
    },
    {
      input: {
        actionName: '查看 git 提交历史',
        command: 'git log --oneline -10',
        workdir: '/home/user/project',
      },
    },
  ],
  needsApproval: ({ command }) => needsApprovalForCommand(command),
  execute: async ({ command, workdir, timeoutMs, login }): Promise<string> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { cwd } = resolveToolWorkdir({ workdir, allowOutside });
    const { file, args } = buildShellCommand({ command, login });

    const startAt = Date.now();
    const outputChunks: string[] = [];
    let timedOut = false;

    const child = spawn(file, args, {
      cwd,
      env: buildExecEnv({}),
      stdio: "pipe",
    });

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => outputChunks.push(String(chunk)));

    let timeoutId: NodeJS.Timeout | null = null;
    if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      // 超时后强制终止进程，避免卡死。
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, Math.floor(timeoutMs));
    }

    const { code } = await new Promise<{ code: number | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode) => {
        resolve({ code: exitCode });
      });
    }).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    const durationMs = Date.now() - startAt;
    const durationSeconds = Math.round(durationMs / 100) / 10;
    const aggregatedOutput = outputChunks.join("");
    const output = timedOut
      ? `command timed out after ${durationMs} milliseconds\n${aggregatedOutput}`
      : aggregatedOutput;

    const truncated = formatFreeformOutput(output);
    const sections = [`Exit code: ${code ?? -1}`, `Wall time: ${durationSeconds} seconds`];
    if (truncated.totalLines !== truncated.truncatedLines) {
      sections.push(`Total output lines: ${truncated.totalLines}`);
    }
    sections.push("Output:", truncated.text);

    return sections.join("\n");
  },
});
