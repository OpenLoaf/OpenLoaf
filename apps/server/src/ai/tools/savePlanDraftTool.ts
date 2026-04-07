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
import {
  savePlanDraftToolDef,
  type SavePlanDraftArgs,
} from "@openloaf/api/types/tools/runtime";
import { getSessionId } from "@/ai/shared/context/requestContext";
import {
  getNextPlanNo,
  savePlanFile,
} from "@/ai/services/chat/planFileService";

type SavePlanDraftOutput = {
  ok: true;
  data: {
    /** Relative file name like "PLAN_1.md" — use this value with SubmitPlan. */
    planFilePath: string;
    /** Absolute path for logging/debug only. */
    planAbsPath: string;
    /** Assigned plan number. */
    planNo: number;
    /** Number of steps saved. */
    stepCount: number;
  };
  /** Guidance for the plan subagent on how to end its turn. */
  message: string;
};

/**
 * Save a plan draft to PLAN_N.md for the current session.
 *
 * This tool is exclusively registered for the `plan` subagent. It:
 * - Atomically assigns the next planNo via session-level lock
 * - Writes PLAN_{no}.md with status='pending' (not yet approved)
 * - Returns the RELATIVE path (e.g. "PLAN_1.md") so the parent agent can
 *   pass it directly to SubmitPlan, which resolves paths the same way as Write.
 */
export const savePlanDraftTool = tool({
  description: savePlanDraftToolDef.description,
  inputSchema: zodSchema(savePlanDraftToolDef.parameters),
  execute: async (input: SavePlanDraftArgs): Promise<SavePlanDraftOutput> => {
    const sessionId = getSessionId();
    if (!sessionId) {
      throw new Error("No session context available.");
    }

    const planNo = await getNextPlanNo(sessionId);
    const planAbsPath = await savePlanFile(sessionId, planNo, {
      actionName: input.actionName,
      explanation: input.explanation,
      plan: input.steps,
      status: "pending",
    });

    // SubmitPlan expects the SAME path the AI would pass to Write — for files
    // in session dir / project root that's the relative basename PLAN_N.md.
    const planFilePath = `PLAN_${planNo}.md`;

    return {
      ok: true,
      data: {
        planFilePath,
        planAbsPath,
        planNo,
        stepCount: input.steps.length,
      },
      message: `Plan draft saved. End your turn with this exact summary:

Plan saved to: ${planFilePath}
Steps: ${input.steps.length}
Critical files for implementation:
- <list the 3-5 most important files here>

Do NOT call SubmitPlan — that is the parent agent's responsibility.`,
    };
  },
});
