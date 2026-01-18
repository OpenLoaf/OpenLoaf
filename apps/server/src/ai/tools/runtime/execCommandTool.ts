import { spawn } from "node:child_process";
import { tool, zodSchema } from "ai";
import { execCommandToolDefUnix, execCommandToolDefWin } from "@tenas-ai/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { resolveToolWorkdir } from "@/ai/tools/runtime/toolScope";
import {
  buildExecEnv,
  formatUnifiedExecOutput,
  resolveMaxOutputChars,
  waitForOutput,
} from "@/ai/tools/runtime/execUtils";
import {
  createExecSession,
  getExecSessionStatus,
  readExecOutput,
} from "@/ai/tools/runtime/execSessionStore";

const execCommandToolDef = process.platform === "win32" ? execCommandToolDefWin : execCommandToolDefUnix;

/** Build shell command arguments from exec input. */
function buildShellCommand(input: {
  cmd: string;
  shell?: string;
  login?: boolean;
}): { file: string; args: string[] } {
  const trimmed = input.cmd.trim();
  if (!trimmed) throw new Error("cmd is required.");
  const resolvedShell =
    input.shell?.trim() ||
    (process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe"
      : process.env.SHELL || "/bin/sh");

  if (process.platform === "win32") {
    const lowered = resolvedShell.toLowerCase();
    const isPowerShell = lowered.includes("powershell") || lowered.includes("pwsh");
    const args = isPowerShell ? ["-NoLogo", "-Command", trimmed] : ["/d", "/s", "/c", trimmed];
    return { file: resolvedShell, args };
  }

  const args = [];
  if (input.login ?? true) args.push("-l");
  args.push("-c", trimmed);
  return { file: resolvedShell, args };
}

/** Start an interactive exec session with scope enforcement. */
export const execCommandTool = tool({
  description: execCommandToolDef.description,
  inputSchema: zodSchema(execCommandToolDef.parameters),
  execute: async ({
    cmd,
    workdir,
    shell,
    login,
    tty,
    yieldTimeMs,
    maxOutputTokens,
  }): Promise<string> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { cwd } = resolveToolWorkdir({ workdir, allowOutside });
    const { file, args } = buildShellCommand({ cmd, shell, login });

    const child = spawn(file, args, {
      cwd,
      env: buildExecEnv({ tty }),
      stdio: "pipe",
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
