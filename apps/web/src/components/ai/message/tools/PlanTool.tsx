/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, MessageSquare, ExternalLink, Loader2 } from "lucide-react";
import { useChatActions, useChatSession, useChatStatus, useChatTools } from "../../context";
import { useLayoutState } from "@/hooks/use-layout-state";
import { trpcClient } from "@/utils/trpc";
import type { AnyToolPart } from "./shared/tool-utils";
import {
  getApprovalId,
  isApprovalPending,
  normalizeToolInput,
  asPlainObject,
} from "./shared/tool-utils";

/**
 * SubmitPlan tool renderer — reads plan content from PLAN file via tRPC.
 */
export default function PlanTool({ part, className }: { part: AnyToolPart; className?: string }) {
  const isApprovalState = part.state === "approval-requested" || isApprovalPending(part);
  const isDecided = part.approval?.approved === true || part.approval?.approved === false;

  if (!isApprovalState && !isDecided) return null;

  return <PlanApprovalCard part={part} className={className} />;
}

// ---------------------------------------------------------------------------
// PlanApprovalCard
// ---------------------------------------------------------------------------

function PlanApprovalCard({ part, className }: { part: AnyToolPart; className?: string }) {
  const { t: tAi } = useTranslation("ai");
  const { status } = useChatStatus();
  const { sessionId } = useChatSession();
  const { addToolApprovalResponse } = useChatActions();
  const {
    toolParts,
    upsertToolPart,
    queueToolApprovalPayload,
    continueAfterToolApprovals,
  } = useChatTools();

  const [showFeedback, setShowFeedback] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const approvalId = getApprovalId(part);
  // 逻辑：tool 执行失败时 state 为 output-error，此时 approval 字段虽然可能为 true 但结果已失败，
  // UI 优先显示错误而非"已批准"徽章。
  const isError = (part as any).state === "output-error";
  const errorText = typeof (part as any).errorText === "string" ? (part as any).errorText : "";
  const isApproved = !isError && part.approval?.approved === true;
  const isRejected = part.approval?.approved === false;
  const isDecided = isApproved || isRejected || isError;
  const disabled = isSubmitting || isDecided || status === "streaming" || status === "submitted";

  // Detect tool type
  const toolName = (part as any).toolName ?? (part as any).type?.replace?.("tool-", "") ?? "";
  const isSubmitPlan = toolName === "SubmitPlan";

  // Extract input
  const rawInput = normalizeToolInput(part.input);
  const inputObj = asPlainObject(rawInput) as Record<string, unknown> | null;

  // SubmitPlan: planFilePath from input (AI-provided path, same as Write tool).
  const planFilePathInput = isSubmitPlan && typeof inputObj?.planFilePath === "string" ? inputObj.planFilePath : "";
  // Derive planNo from filename for stack IDs and display labels (PLAN_N.md pattern).
  const planNo = React.useMemo(() => {
    if (!planFilePathInput) return 0;
    const basename = planFilePathInput.split(/[\\/]/).pop() ?? "";
    const match = basename.match(/^PLAN_(\d+)\.md$/);
    return match?.[1] ? Number.parseInt(match[1], 10) : 0;
  }, [planFilePathInput]);
  const planDisplayName = React.useMemo(() => {
    if (!planFilePathInput) return "PLAN.md";
    return planFilePathInput.split(/[\\/]/).pop() ?? "PLAN.md";
  }, [planFilePathInput]);

  // Fetch plan file content for SubmitPlan
  const [planFileData, setPlanFileData] = React.useState<{
    actionName: string;
    steps: string[];
    filePath?: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isSubmitPlan || !sessionId || !planFilePathInput) return;
    let cancelled = false;
    setLoading(true);
    trpcClient.chat.readPlanFile.query({ sessionId, planFilePath: planFilePathInput })
      .then((data) => {
        if (cancelled || !data) return;
        setPlanFileData({
          actionName: data.actionName,
          steps: data.steps,
          filePath: data.filePath,
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isSubmitPlan, sessionId, planFilePathInput]);

  // Resolve display data from plan file
  const actionName = isSubmitPlan
    ? (planFileData?.actionName ?? tAi("plan.title"))
    : (typeof inputObj?.actionName === "string" ? inputObj.actionName : tAi("plan.title"));
  const planSteps: string[] = React.useMemo(() => {
    if (isSubmitPlan) return planFileData?.steps ?? [];
    const raw = inputObj?.plan;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => (typeof item === "string" ? item.trim() : typeof item?.step === "string" ? item.step.trim() : ""))
      .filter((s) => s.length > 0);
  }, [isSubmitPlan, planFileData?.steps, inputObj?.plan]);

  // Open PLAN.md in Stack
  const handleOpenStack = React.useCallback(async () => {
    if (!sessionId) return;
    const filePath = planFileData?.filePath;
    const stackKey = planFilePathInput || `plan-${planNo || 0}`;
    const stackId = `plan-${sessionId}-${stackKey}`;
    if (filePath) {
      const layout = useLayoutState.getState();
      const existing = layout.stack.find((item) => item.id === stackId);
      if (existing) {
        layout.setActiveStackItemId(stackId);
        if (layout.stackHidden) layout.setStackHidden(false);
        return;
      }
      layout.pushStackItem({
        id: stackId,
        sourceKey: stackId,
        component: "markdown-viewer",
        params: { uri: filePath, name: planDisplayName, ext: "md", readOnly: true, __customHeader: true },
      });
      return;
    }
    // Fallback: query listPlanFiles
    try {
      const files = await trpcClient.chat.listPlanFiles.query({ sessionId });
      const target = files[files.length - 1];
      if (!target?.filePath) return;
      const fallbackId = `plan-${sessionId}-${target.planNo}`;
      const layout = useLayoutState.getState();
      layout.pushStackItem({
        id: fallbackId,
        sourceKey: fallbackId,
        component: "markdown-viewer",
        params: { uri: target.filePath, name: `PLAN_${target.planNo}.md`, ext: "md", readOnly: true, __customHeader: true },
      });
    } catch {}
  }, [sessionId, planNo, planFilePathInput, planDisplayName, planFileData?.filePath]);

  const updateApprovalSnapshot = React.useCallback(
    (approved: boolean) => {
      for (const [tcId, snapshot] of Object.entries(toolParts)) {
        if (snapshot?.approval?.id !== approvalId) continue;
        upsertToolPart(tcId, {
          ...snapshot,
          approval: { ...snapshot.approval, approved },
        });
        break;
      }
    },
    [toolParts, upsertToolPart, approvalId],
  );

  const handleApprove = React.useCallback(async () => {
    if (disabled) return;
    setIsSubmitting(true);
    updateApprovalSnapshot(true);
    try {
      queueToolApprovalPayload(toolCallId, { approved: true });
      if (approvalId) {
        addToolApprovalResponse({ id: approvalId, approved: true });
      }
      continueAfterToolApprovals();
    } finally {
      setIsSubmitting(false);
    }
  }, [disabled, approvalId, toolCallId, updateApprovalSnapshot, addToolApprovalResponse, queueToolApprovalPayload, continueAfterToolApprovals]);

  const handleReject = React.useCallback(async () => {
    if (disabled || !feedback.trim()) return;
    setIsSubmitting(true);
    updateApprovalSnapshot(false);
    try {
      queueToolApprovalPayload(toolCallId, { approved: false, feedback: feedback.trim() });
      if (approvalId) {
        addToolApprovalResponse({ id: approvalId, approved: true });
      }
      continueAfterToolApprovals();
    } finally {
      setIsSubmitting(false);
    }
  }, [disabled, feedback, approvalId, toolCallId, updateApprovalSnapshot, addToolApprovalResponse, queueToolApprovalPayload, continueAfterToolApprovals]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && feedback.trim()) {
      e.preventDefault();
      handleReject();
    }
  }, [feedback, handleReject]);

  // 逻辑：SubmitPlan 首次出现时自动在 stack 打开对应 PLAN 文件（已打开则跳过）。
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isSubmitPlan || autoOpenedRef.current || !sessionId || !planFilePathInput) return;
    // 必须等待 planFileData（含绝对路径）解析完成后再打开。
    if (!planFileData?.filePath) return;
    autoOpenedRef.current = true;
    const stackId = `plan-${sessionId}-${planFilePathInput}`;
    const layout = useLayoutState.getState();
    const existing = layout.stack.find((item) => item.id === stackId);
    if (existing) return;
    layout.pushStackItem({
      id: stackId,
      sourceKey: stackId,
      component: "markdown-viewer",
      params: { uri: planFileData.filePath, name: planDisplayName, ext: "md", readOnly: true, __customHeader: true },
    });
  }, [isSubmitPlan, sessionId, planFilePathInput, planDisplayName, planFileData?.filePath]);

  // Loading state for SubmitPlan
  if (isSubmitPlan && loading && planSteps.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border/60 bg-muted/10 px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{tAi("plan.loading")}</span>
      </div>
    );
  }

  // 逻辑：SubmitPlan 即便读取不到 plan 内容，也保留审批卡片（展示文件链接和审批按钮）。
  if (!isSubmitPlan && planSteps.length === 0) return null;

  // 逻辑：SubmitPlan 无步骤内容时渲染紧凑单行卡片（避免空心大卡片视觉突兀）。
  if (isSubmitPlan && planSteps.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-border/60 bg-muted/10 px-3 py-1.5",
          className,
        )}
      >
        <button
          type="button"
          onClick={handleOpenStack}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{planDisplayName}</span>
        </button>
        {isDecided ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px]" title={isError ? errorText : undefined}>
            {isError ? (
              <>
                <XCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive truncate max-w-[200px]">{tAi("plan.execFailed") || "执行失败"}</span>
              </>
            ) : isApproved ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-foreground" />
                <span className="text-muted-foreground">{tAi("plan.approved")}</span>
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive">{tAi("plan.rejected")}</span>
              </>
            )}
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={handleApprove}
            className={cn(
              "h-6 shrink-0 rounded-full px-3 text-[11px] font-medium",
              "bg-foreground text-background hover:bg-foreground/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors duration-150",
            )}
          >
            {tAi("plan.execute")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border/60 bg-muted/10 overflow-hidden", className)}>
      {/* Plan content */}
      <div className="px-4 py-3 space-y-3">
        {/* Title + open in stack */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">{actionName}</h4>
          <button
            type="button"
            onClick={handleOpenStack}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ExternalLink className="h-3 w-3" />
            <span>{planDisplayName}</span>
          </button>
        </div>

        {/* Steps */}
        <ol className="space-y-1 text-xs text-foreground/80">
          {planSteps.map((step, i) => (
            <li key={i} className="flex gap-2 leading-relaxed">
              <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Decision state */}
      {isDecided ? (
        <div className="flex items-center justify-end gap-2 border-t border-border/30 px-4 py-2 text-xs" title={isError ? errorText : undefined}>
          {isError ? (
            <>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-destructive font-medium truncate">{tAi("plan.execFailed") || "执行失败"}</span>
              {errorText ? <span className="text-muted-foreground truncate">— {errorText}</span> : null}
            </>
          ) : isApproved ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
              <span className="text-foreground font-medium">{tAi("plan.approved")}</span>
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-destructive font-medium">{tAi("plan.rejected")}</span>
            </>
          )}
        </div>
      ) : (
        /* Action buttons */
        <div className="border-t border-border/30 px-4 py-2">
          {showFeedback ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tAi("plan.feedbackPlaceholder")}
                disabled={disabled}
                rows={2}
                className={cn(
                  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground resize-none",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFeedback(false)}
                  className="h-7 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                  {tAi("plan.cancel")}
                </button>
                <button
                  type="button"
                  disabled={disabled || !feedback.trim()}
                  onClick={handleReject}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs font-medium",
                    "bg-foreground text-background hover:bg-foreground/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-colors duration-150",
                  )}
                >
                  {tAi("plan.submitFeedback")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowFeedback(true)}
                className={cn(
                  "h-7 rounded-full px-3 text-xs text-muted-foreground",
                  "hover:text-foreground hover:bg-muted/50",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors duration-150",
                  "flex items-center gap-1.5",
                )}
              >
                <MessageSquare className="h-3 w-3" />
                {tAi("plan.modify")}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={handleApprove}
                className={cn(
                  "h-7 rounded-full px-4 text-xs font-medium",
                  "bg-foreground text-background hover:bg-foreground/90",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors duration-150",
                )}
              >
                {tAi("plan.execute")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
