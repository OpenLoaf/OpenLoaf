import { tool, zodSchema } from "ai";
import { writeStdinToolDef } from "@tenas-ai/api/types/tools/runtime";
import { resolveMaxOutputChars, waitForOutput } from "@/ai/tools/runtime/execUtils";
import {
  getExecSessionStatus,
  readExecOutput,
  writeExecStdin,
} from "@/ai/tools/runtime/execSessionStore";

type WriteStdinToolOutput = {
  ok: true;
  data: {
    sessionId: string;
    output: string;
    truncated: boolean;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  };
};

/** Write stdin for an existing exec session and read output. */
export const writeStdinTool = tool({
  description: writeStdinToolDef.description,
  inputSchema: zodSchema(writeStdinToolDef.parameters),
  execute: async ({
    sessionId,
    chars,
    yieldTimeMs,
    maxOutputTokens,
  }): Promise<WriteStdinToolOutput> => {
    writeExecStdin({ sessionId, chars });
    await waitForOutput(yieldTimeMs);
    const { output, truncated } = readExecOutput({
      sessionId,
      maxChars: resolveMaxOutputChars(maxOutputTokens),
    });
    const status = getExecSessionStatus(sessionId);

    return {
      ok: true,
      data: {
        sessionId,
        output,
        truncated,
        exitCode: status.exitCode,
        signal: status.signal,
      },
    };
  },
});
