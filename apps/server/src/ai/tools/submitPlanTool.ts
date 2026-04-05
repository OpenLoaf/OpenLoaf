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
  submitPlanToolDef,
  type SubmitPlanArgs,
} from "@openloaf/api/types/tools/runtime";
import {
  setPlanUpdate,
  setCurrentPlanNo,
  markPlanNoAllocated,
  getSessionId,
  consumeToolApprovalPayload,
} from "@/ai/shared/context/requestContext";
import {
  readPlanFileFromAbsPath,
  derivePlanNoFromPath,
  markPlanFileStatus,
} from "@/ai/services/chat/planFileService";
import { resolveWriteTargetPath } from "@/ai/tools/fileTools";
import { logger } from "@/common/logger";

type SubmitPlanToolOutput = {
  ok: true;
  data: { approved: boolean };
  /** Plan file content (only on approval). */
  planContent?: string;
  /** Absolute plan file path. */
  planFilePath?: string;
  /** Original relative path as passed by the AI. */
  planFilePathInput?: string;
  /** Derived plan number (if filename matches PLAN_N.md). */
  planNo?: number;
  /** Feedback from user (only on rejection). */
  feedback?: string;
  /** Message for the LLM. */
  message: string;
};

/**
 * Submit a PLAN file for user approval.
 *
 * File-based plan system:
 * - AI creates/edits a PLAN file using Write/Edit tools (any path, typically "PLAN_1.md").
 * - AI calls SubmitPlan({ planFilePath }) to trigger approval.
 * - Server resolves the path via the SAME logic as the Write tool, so paths always match.
 * - On approval: execute() reads the file and returns content.
 * - On rejection: returns the file path + feedback; AI edits the same file and resubmits.
 */
export const submitPlanTool = tool({
  description: submitPlanToolDef.description,
  inputSchema: zodSchema(submitPlanToolDef.parameters),
  needsApproval: true,
  execute: async (input: SubmitPlanArgs, { toolCallId }): Promise<SubmitPlanToolOutput> => {
    const sessionId = getSessionId();
    if (!sessionId) {
      throw new Error("No session context available.");
    }

    const planFilePathInput = input.planFilePath;
    // Resolve path identically to Write/Edit tools so files always match.
    const { absPath } = await resolveWriteTargetPath(planFilePathInput);
    const planNoFromPath = derivePlanNoFromPath(planFilePathInput);

    // Consume approval payload (set by chatStreamHelpers.stripPendingToolParts).
    const approvalPayload = consumeToolApprovalPayload(toolCallId);

    // Rejection: return file path + feedback for AI to revise.
    if (approvalPayload && approvalPayload.approved === false) {
      const feedback = typeof approvalPayload.feedback === "string" ? approvalPayload.feedback : "";
      return {
        ok: true,
        data: { approved: false },
        planFilePath: absPath,
        planFilePathInput,
        planNo: planNoFromPath || undefined,
        feedback,
        message: `User requested changes. Read "${planFilePathInput}", edit it, then call SubmitPlan(planFilePath="${planFilePathInput}") again.${feedback ? `\n\nFeedback: ${feedback}` : ""}`,
      };
    }

    // Approval: read PLAN file from resolved path.
    const planData = await readPlanFileFromAbsPath(absPath, planNoFromPath);
    if (!planData) {
      throw new Error(`Plan file "${planFilePathInput}" not found. Please create the file first using the Write tool with the exact same path.`);
    }

    // Store plan in RequestContext for prepareStep injection.
    setPlanUpdate({
      actionName: planData.actionName,
      explanation: planData.explanation,
      plan: planData.steps,
    });
    if (planNoFromPath > 0) {
      setCurrentPlanNo(planNoFromPath);
      markPlanNoAllocated();
      // Mark plan file as active (only when planNo matches PLAN_N.md pattern and file is in sessionDir).
      await markPlanFileStatus(sessionId, planNoFromPath, "active").catch((err) => {
        logger.warn({ err, sessionId, planNo: planNoFromPath }, "[plan] mark plan active failed (non-standard path)");
      });
    }

    return {
      ok: true,
      data: { approved: true },
      planContent: planData.content,
      planFilePath: absPath,
      planFilePathInput,
      planNo: planNoFromPath || undefined,
      message: `Plan approved. Start working now — do NOT call SubmitPlan again.

- Follow the plan's **direction**; do NOT mechanically map each step to one tool call.
- Use tools only for things that actually need to run (edit files, run commands, fetch data, process content).
- Analysis findings, tech stack summaries, list outputs — **write them directly in your conversation reply**, do NOT echo them via Bash.
- If a step fails, explain why and continue to the next, or stop and tell the user.`,
    };
  },
});
