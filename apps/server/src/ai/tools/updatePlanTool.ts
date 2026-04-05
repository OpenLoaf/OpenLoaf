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
  updatePlanToolDef,
  type UpdatePlanArgs,
} from "@openloaf/api/types/tools/runtime";
import {
  setPlanUpdate,
  getCurrentPlanNo,
  setCurrentPlanNo,
  isPlanNoAllocated,
  markPlanNoAllocated,
  getSessionId,
  consumeToolApprovalPayload,
} from "@/ai/shared/context/requestContext";
import { getNextPlanNo, markPlanFileStatus } from "@/ai/services/chat/planFileService";
import { logger } from "@/common/logger";

type UpdatePlanToolOutput = {
  /** Whether the tool execution succeeded. */
  ok: true;
  data: {
    /** Whether the plan payload was accepted. */
    updated: true;
  };
  /** Message for the LLM after approval. */
  message?: string;
};


/**
 * @deprecated Use SubmitPlan instead. This tool is kept for backward compatibility
 * with old message histories that contain UpdatePlan tool parts.
 *
 * Create a task plan and wait for user approval.
 * After approval, the LLM executes the plan directly without calling this tool again.
 */
export const updatePlanTool = tool({
  description: updatePlanToolDef.description,
  inputSchema: zodSchema(updatePlanToolDef.parameters),
  needsApproval: true,
  execute: async (input: UpdatePlanArgs, { toolCallId }): Promise<UpdatePlanToolOutput> => {
    // 消费审批 payload，用户拒绝时返回正常结果（含反馈），让 AI 做增量修改。
    const approvalPayload = consumeToolApprovalPayload(toolCallId);
    if (approvalPayload && approvalPayload.approved === false) {
      const feedback = typeof approvalPayload.feedback === "string" ? approvalPayload.feedback : "";
      return {
        ok: true,
        data: { updated: false as unknown as true },
        message: `用户对计划提出了修改意见，请根据反馈调整后重新调用 UpdatePlan 提交修改后的计划。\n${feedback ? `\n用户反馈：${feedback}` : ""}\n\nThe user requested changes. Revise and call UpdatePlan again.\n${feedback ? `\nFeedback: ${feedback}` : ""}`,
      };
    }

    // 分配 planNo（同一 request 内二次 full 不递增），
    // 标记旧 plan 文件为 abandoned，缓存到请求上下文等待 onFinish 落库。
    const sessionId = getSessionId();
    if (sessionId && !isPlanNoAllocated()) {
      try {
        const oldPlanNo = getCurrentPlanNo();
        if (oldPlanNo) {
          void markPlanFileStatus(sessionId, oldPlanNo, "abandoned").catch(() => {});
        }
        const newPlanNo = await getNextPlanNo(sessionId);
        setCurrentPlanNo(newPlanNo);
        markPlanNoAllocated();
      } catch (err) {
        logger.warn({ err, sessionId }, "[plan] allocate planNo failed, continuing without file persistence");
      }
    }

    const steps = input.plan.filter((s) => s.trim().length > 0);
    setPlanUpdate({
      actionName: input.actionName,
      explanation: input.explanation,
      plan: steps,
    });
    return {
      ok: true,
      data: { updated: true },
      message: `计划已创建（${steps.length} 个步骤），用户已批准。请立即按计划步骤顺序执行任务，不要再调用 UpdatePlan 工具。\n\nPlan created (${steps.length} steps), user approved. Start executing now. Do NOT call UpdatePlan again.`,
    };
  },
});
