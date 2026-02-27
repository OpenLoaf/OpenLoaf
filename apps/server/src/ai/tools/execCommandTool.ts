/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { spawn as spawnPty } from "node-pty";
import { tool, zodSchema } from "ai";
import { execCommandToolDef } from "@openloaf/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { resolveToolWorkdir } from "@/ai/tools/toolScope";
import {
  buildExecEnv,
  ensurePtyHelperExecutable,
  formatUnifiedExecOutput,
  resolveMaxOutputChars,
  waitForOutput,
} from "@/ai/tools/execUtils";
import {
  createExecSession,
  getExecSessionStatus,
  readExecOutput,
} from "@/ai/tools/execSessionStore";
import { needsApprovalForCommand } from "@/ai/tools/commandApproval";
import { getRequestContext } from "@/ai/shared/context/requestContext";
import { supervisionService } from "@/ai/services/supervision/supervisionService";

type WindowsShellKind = "powershell" | "cmd";

/** Resolve Windows shell kind from a provided shell path. */
function detectWindowsShellKind(shellPath: string): WindowsShellKind | null {
  const lowered = shellPath.toLowerCase();
  const base = lowered.split(/[/\\]/).pop() || lowered;
  if (base.includes("powershell") || base.startsWith("pwsh")) return "powershell";
  if (base === "cmd" || base === "cmd.exe") return "cmd";
  return null;
}

/** Build shell command arguments from exec input. */
function buildShellCommand(input: {
  cmd: string;
  shell?: string;
  login?: boolean;
}): { file: string; args: string[] } {
  const trimmed = input.cmd.trim();
  if (!trimmed) throw new Error("cmd is required.");
  if (process.platform === "win32") {
    const providedShell = input.shell?.trim();
    const detectedKind = providedShell ? detectWindowsShellKind(providedShell) : "powershell";
    const kind = detectedKind ?? "cmd";
    const file =
      providedShell ||
      (kind === "powershell" ? "powershell.exe" : process.env.ComSpec || "cmd.exe");
    if (kind === "powershell") {
      const args: string[] = [];
      if (input.login === false) args.push("-NoProfile");
      args.push("-Command", trimmed);
      return { file, args };
    }
    return { file, args: ["/c", trimmed] };
  }

  const resolvedShell = input.shell?.trim() || process.env.SHELL || "/bin/sh";
  const args = [(input.login ?? true) ? "-lc" : "-c", trimmed];
  return { file: resolvedShell, args };
}

/** Start an interactive exec session with scope enforcement. */
export const execCommandTool = tool({
  description: execCommandToolDef.description,
  inputSchema: zodSchema(execCommandToolDef.parameters),
  needsApproval: ({ cmd }) => {
    const ctx = getRequestContext();
    if (ctx?.supervisionMode) return false;
    return needsApprovalForCommand(cmd);
  },
  execute: async ({
    cmd,
    workdir,
    shell,
    login,
    tty,
    yieldTimeMs,
    maxOutputTokens,
  }): Promise<string> => {
    // Supervision mode: check with supervisionService before executing
    const ctx = getRequestContext();
    if (ctx?.supervisionMode && ctx.taskId && needsApprovalForCommand(cmd)) {
      const decision = await supervisionService.evaluate({
        toolName: "exec-command",
        toolArgs: { cmd, workdir },
        taskId: ctx.taskId,
        taskName: ctx.taskId,
      });
      if (decision.decision === "reject") {
        return JSON.stringify({ error: `命令被监管拒绝: ${decision.reason}` });
      }
    }

    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { cwd } = resolveToolWorkdir({ workdir, allowOutside });
    const { file, args } = buildShellCommand({ cmd, shell, login });

    ensurePtyHelperExecutable();
    const child = spawnPty(file, args, {
      cwd,
      env: buildExecEnv({ tty }),
      name: tty ? "xterm-256color" : "xterm",
      cols: 80,
      rows: 24,
      // 中文注释：Windows 端使用 ConPTY，提高兼容性。
      useConpty: process.platform === "win32",
    });

    const session = createExecSession(child);
    const resolvedYieldTimeMs = typeof yieldTimeMs === "number" ? yieldTimeMs : 10000;
    await waitForOutput(resolvedYieldTimeMs);
    const { output, chunkId, wallTimeMs } = readExecOutput({
      sessionId: session.id,
      maxChars: resolveMaxOutputChars(maxOutputTokens),
    });
    const status = getExecSessionStatus(session.id);
    const sessionId = status.exitCode === null ? session.id : undefined;

    return formatUnifiedExecOutput({
      chunkId,
      wallTimeMs,
      exitCode: status.exitCode,
      sessionId,
      output,
    });
  },
});
