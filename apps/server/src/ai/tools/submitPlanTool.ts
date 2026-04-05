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
        message: `用户对计划提出修改意见。请用 Read 读取计划文件 "${planFilePathInput}"，用 Edit 修改后再次调用 SubmitPlan(planFilePath="${planFilePathInput}")。\n${feedback ? `\n用户反馈：${feedback}` : ""}\n\nUser requested changes. Read "${planFilePathInput}", edit it, then call SubmitPlan(planFilePath="${planFilePathInput}") again.\n${feedback ? `\nFeedback: ${feedback}` : ""}`,
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
      message: `用户已批准计划（${planData.steps.length} 个步骤）。请立即按步骤执行，不要再调用 SubmitPlan。\n\n${planData.content}\n\nPlan approved (${planData.steps.length} steps). Start executing now. Do NOT call SubmitPlan again.`,
    };
  },
});
