"use client";

import * as React from "react";
import ToolApprovalActions from "./shared/ToolApprovalActions";
import ToolApprovalPrompt from "./shared/ToolApprovalPrompt";
import { getApprovalId, isApprovalPending } from "./shared/tool-utils";

type TestApprovalToolPart = {
  toolName?: string;
  type: string;
  state?: string;
  approval?: { id?: string; approved?: boolean; reason?: string };
};

/**
 * Render a minimal approval UI for the test-approval tool.
 */
export function TestApprovalTool({ part }: { part: TestApprovalToolPart }) {
  const approvalId = getApprovalId(part as any);
  const showActions = isApprovalPending(part as any) && Boolean(approvalId);
  const approved = part.approval?.approved;

  const outputText =
    approved === true ? "已允许执行" : approved === false ? "已拒绝执行" : "";

  return (
    <ToolApprovalPrompt
      action="需要审批测试操作"
      primary="test-approval"
      isApprovalRequested={showActions}
      isRejected={approved === false}
      actions={showActions && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null}
      output={showActions ? undefined : outputText}
      outputTone={approved === false ? "error" : "default"}
    />
  );
}
