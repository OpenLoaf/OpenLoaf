import { spawn } from "node:child_process";
import { tool, zodSchema } from "ai";
import { shellToolDef } from "@openloaf/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { resolveToolWorkdir } from "@/ai/tools/toolScope";
import { buildExecEnv, formatStructuredOutput } from "@/ai/tools/execUtils";
import { needsApprovalForCommand } from "@/ai/tools/commandApproval";

/** Execute a one-shot shell command with scope enforcement. */
export const shellTool = tool({
  description: shellToolDef.description,
  inputSchema: zodSchema(shellToolDef.parameters),
  needsApproval: ({ command }) => needsApprovalForCommand(command),
  execute: async ({ command, workdir, timeoutMs }): Promise<string> => {
    const resolvedCommand = command ?? [];
    const [commandBin, ...commandArgs] = resolvedCommand;
    if (!commandBin) throw new Error("command is required.");
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const { cwd } = resolveToolWorkdir({ workdir, allowOutside });

    const startAt = Date.now();
    const outputChunks: string[] = [];
    let timedOut = false;

    const child = spawn(commandBin, commandArgs, {
      cwd,
      env: buildExecEnv({}),
      stdio: "pipe",
    });

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk: string) => outputChunks.push(String(chunk)));

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
      child.once("exit", (exitCode: number | null) => {
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

    const payload = {
      output: formatStructuredOutput(output),
      metadata: {
        exit_code: code ?? -1,
        duration_seconds: durationSeconds,
      },
    };

    return JSON.stringify(payload);
  },
});
