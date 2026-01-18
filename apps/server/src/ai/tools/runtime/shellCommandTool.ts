import { spawn } from "node:child_process";
import { tool, zodSchema } from "ai";
import { shellCommandToolDef } from "@tenas-ai/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { resolveToolWorkdir } from "@/ai/tools/runtime/toolScope";
import { buildExecEnv } from "@/ai/tools/runtime/execUtils";

type ShellCommandToolOutput = {
  ok: true;
  data: {
    command: string[];
    cwd: string;
    rootLabel: "workspace" | "project" | "external";
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
  };
};

/** Execute a one-shot shell command with scope enforcement. */
export const shellCommandTool = tool({
  description: shellCommandToolDef.description,
  inputSchema: zodSchema(shellCommandToolDef.parameters),
  execute: async ({ command, workdir, timeoutMs }): Promise<ShellCommandToolOutput> => {
    if (!command?.length) throw new Error("command is required.");
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { cwd, rootLabel } = resolveToolWorkdir({ workdir, allowOutside });

    const startAt = Date.now();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;

    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: buildExecEnv({}),
      stdio: "pipe",
    });

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => stdoutChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(String(chunk)));

    let timeoutId: NodeJS.Timeout | null = null;
    if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      // 中文注释：超时后强制终止进程，避免卡死。
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, Math.floor(timeoutMs));
    }

    const { code, signal } = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, exitSignal) => {
        resolve({ code: exitCode, signal: exitSignal });
      });
    }).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    return {
      ok: true,
      data: {
        command,
        cwd,
        rootLabel,
        exitCode: code,
        signal,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        timedOut,
        durationMs: Date.now() - startAt,
      },
    };
  },
});
