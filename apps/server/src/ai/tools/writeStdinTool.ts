/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from "ai";
import { writeStdinToolDef } from "@openloaf/api/types/tools/runtime";
import { formatUnifiedExecOutput, resolveMaxOutputChars, waitForOutput } from "@/ai/tools/execUtils";
import {
  getExecSessionStatus,
  readExecOutput,
  writeExecStdin,
} from "@/ai/tools/execSessionStore";

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
