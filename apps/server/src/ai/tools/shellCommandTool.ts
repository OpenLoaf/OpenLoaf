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
    // 强制 PowerShell 输出 UTF-8，避免中文 Windows 默认 GBK 编码导致乱码。
    const utf8Prefix = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; ';
    args.push("-Command", utf8Prefix + trimmed);
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
        command: 'find src -name "*.ts" | head -20',
        workdir: '/home/user/project',
      },
    },
    {
      input: {
        command: 'git log --oneline -10',
        workdir: '/home/user/project',
      },
    },
  ],
  needsApproval: ({ command }) => needsApprovalForCommand(command),
  execute: async ({ command, workdir, login, timeout }): Promise<string> => {
    const { cwd } = resolveToolWorkdir({ workdir });
    const { file, args } = buildShellCommand({ command, login });

    const timeoutMs = Math.min(timeout ?? 120_000, 600_000);
    const startAt = Date.now();
    const outputChunks: string[] = [];
    let timedOut = false;

    const child = spawn(file, args, {
      cwd,
      env: buildExecEnv({}),
      stdio: "pipe",
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // 给进程 3s 优雅退出，否则强杀
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    }, timeoutMs);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => outputChunks.push(String(chunk)));

    const { code } = await new Promise<{ code: number | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode) => {
        resolve({ code: exitCode });
      });
    });

    clearTimeout(timer);

    const durationMs = Date.now() - startAt;
    const durationSeconds = Math.round(durationMs / 100) / 10;
    const aggregatedOutput = outputChunks.join("");

    const truncated = formatFreeformOutput(aggregatedOutput);
    const sections: string[] = [];
    if (timedOut) {
      sections.push(`⚠ Command timed out after ${timeoutMs / 1000}s and was killed.`);
    }
    sections.push(`Exit code: ${code ?? -1}`, `Wall time: ${durationSeconds} seconds`);
    if (truncated.totalLines !== truncated.truncatedLines) {
      sections.push(`Total output lines: ${truncated.totalLines}`);
    }
    sections.push("Output:", truncated.text);

    return sections.join("\n");
  },
});
