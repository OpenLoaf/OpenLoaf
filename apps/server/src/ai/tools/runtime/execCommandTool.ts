import { spawn } from "node:child_process";
import { tool, zodSchema } from "ai";
import { execCommandToolDef } from "@tenas-ai/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { resolveToolWorkdir } from "@/ai/tools/runtime/toolScope";
import { buildExecEnv, resolveMaxOutputChars, waitForOutput } from "@/ai/tools/runtime/execUtils";
import {
  createExecSession,
  getExecSessionStatus,
  readExecOutput,
} from "@/ai/tools/runtime/execSessionStore";

type ExecCommandToolOutput = {
  ok: true;
  data: {
    sessionId: string;
    cwd: string;
    rootLabel: "workspace" | "project" | "external";
    output: string;
    truncated: boolean;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  };
};

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
  if (input.login) args.push("-l");
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
  }): Promise<ExecCommandToolOutput> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { cwd, rootLabel } = resolveToolWorkdir({ workdir, allowOutside });
    const { file, args } = buildShellCommand({ cmd, shell, login });

    const child = spawn(file, args, {
      cwd,
      env: buildExecEnv({ tty }),
      stdio: "pipe",
    });

    const session = createExecSession(child);
    await waitForOutput(yieldTimeMs);
    const { output, truncated } = readExecOutput({
      sessionId: session.id,
      maxChars: resolveMaxOutputChars(maxOutputTokens),
    });
    const status = getExecSessionStatus(session.id);

    return {
      ok: true,
      data: {
        sessionId: session.id,
        cwd,
        rootLabel,
        output,
        truncated,
        exitCode: status.exitCode,
        signal: status.signal,
      },
    };
  },
});
