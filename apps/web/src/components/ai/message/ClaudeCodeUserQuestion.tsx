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
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import type { CcUserQuestion } from "@/hooks/use-chat-runtime";
import { cn } from "@/lib/utils";
import { trpcClient } from "@/utils/trpc";

interface ClaudeCodeUserQuestionProps {
  tabId: string;
  question: CcUserQuestion;
}

/**
 * Interactive question UI rendered when Claude Code calls AskUserQuestion.
 * Displays question text + option buttons (single or multi-select).
 */
export default React.memo(function ClaudeCodeUserQuestion({
  tabId,
  question,
}: ClaudeCodeUserQuestionProps) {
  const { answered, questions } = question;
  const [submitting, setSubmitting] = React.useState(false);

  // 每个 question 的选中状态：{ questionIndex: Set<optionIndex> }
  const [selections, setSelections] = React.useState<Record<number, Set<number>>>({});

  const handleToggle = React.useCallback(
    (qIdx: number, optIdx: number, multiSelect: boolean) => {
      if (answered) return;
      setSelections((prev) => {
        const current = prev[qIdx] ?? new Set<number>();
        const next = new Set(current);
        if (multiSelect) {
          if (next.has(optIdx)) next.delete(optIdx);
          else next.add(optIdx);
        } else {
          next.clear();
          next.add(optIdx);
        }
        return { ...prev, [qIdx]: next };
      });
    },
    [answered],
  );

  const handleSubmit = React.useCallback(async () => {
    if (answered || submitting) return;
    // 构建答案 map：question text → 选中 option labels（逗号分隔）
    const answers: Record<string, string> = {};
    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];
      if (!q) continue;
      const selected = selections[qIdx];
      if (!selected || selected.size === 0) continue;
      const labels = Array.from(selected)
        .sort()
        .map((i) => q.options[i]?.label ?? "")
        .filter(Boolean);
      answers[q.question] = labels.join(", ");
    }

    // 1. 乐观更新 UI
    setSubmitting(true);
    useChatRuntime.getState().updateCcRuntime(tabId, {
      userQuestion: { ...question, answered: true, answers },
    });

    // 2. 调用 tRPC 回传答案到 Claude Code SDK
    try {
      await trpcClient.ai.answerClaudeCodeQuestion.mutate({
        sessionId: question.sessionId,
        toolUseId: question.toolUseId,
        answers,
      });
    } catch {
      // 回传失败，恢复 UI
      useChatRuntime.getState().updateCcRuntime(tabId, {
        userQuestion: { ...question, answered: false },
      });
    } finally {
      setSubmitting(false);
    }
  }, [answered, submitting, questions, selections, tabId, question]);

  // 检查是否有至少一个选中项
  const hasSelection = React.useMemo(() => {
    return Object.values(selections).some((s) => s.size > 0);
  }, [selections]);

  if (questions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      {questions.map((q, qIdx) => (
        <div key={qIdx} className="flex flex-col gap-1.5">
          {q.header && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-primary/60">
              {q.header}
            </span>
          )}
          <p className="text-sm text-foreground">{q.question}</p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {q.options.map((opt, optIdx) => {
              const isSelected = selections[qIdx]?.has(optIdx) ?? false;
              return (
                <button
                  key={optIdx}
                  type="button"
                  disabled={answered || submitting}
                  onClick={() => handleToggle(qIdx, optIdx, q.multiSelect)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors duration-150",
                    answered
                      ? "cursor-default opacity-50"
                      : "cursor-pointer hover:bg-primary/10",
                    isSelected
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                  )}
                  title={opt.description}
                >
                  {q.multiSelect && (
                    <span className="mr-1 inline-block h-3 w-3 align-text-bottom">
                      {isSelected ? "\u2611" : "\u2610"}
                    </span>
                  )}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!answered && (
        <button
          type="button"
          disabled={!hasSelection || submitting}
          onClick={handleSubmit}
          className={cn(
            "mt-1 self-start rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-150",
            hasSelection && !submitting
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "cursor-not-allowed bg-muted text-muted-foreground",
          )}
        >
          {submitting ? "Sending..." : "Confirm"}
        </button>
      )}
      {answered && (
        <span className="text-xs text-ol-green">
          {"\u2713"} Answered
        </span>
      )}
    </div>
  );
});
