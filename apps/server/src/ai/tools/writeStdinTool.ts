import { tool, zodSchema } from "ai";
import { writeStdinToolDefUnix, writeStdinToolDefWin } from "@tenas-ai/api/types/tools/runtime";
import { formatUnifiedExecOutput, resolveMaxOutputChars, waitForOutput } from "@/ai/tools/execUtils";
import {
  getExecSessionStatus,
  readExecOutput,
  writeExecStdin,
} from "@/ai/tools/execSessionStore";

const writeStdinToolDef = process.platform === "win32" ? writeStdinToolDefWin : writeStdinToolDefUnix;

/** Write stdin for an existing exec session and read output. */
export const writeStdinTool = tool({
  description: writeStdinToolDef.description,
  inputSchema: zodSchema(writeStdinToolDef.parameters),
  needsApproval: true,
  execute: async ({ sessionId, chars, yieldTimeMs, maxOutputTokens }): Promise<string> => {
    writeExecStdin({ sessionId, chars });
    const resolvedYieldTimeMs = typeof yieldTimeMs === "number" ? yieldTimeMs : 250;
    await waitForOutput(resolvedYieldTimeMs);
    const { output, chunkId, wallTimeMs } = readExecOutput({
      sessionId,
      maxChars: resolveMaxOutputChars(maxOutputTokens),
    });
    const status = getExecSessionStatus(sessionId);
    const activeSessionId = status.exitCode === null ? sessionId : undefined;

    return formatUnifiedExecOutput({
      chunkId,
      wallTimeMs,
      exitCode: status.exitCode,
      sessionId: activeSessionId,
      output,
    });
  },
});
