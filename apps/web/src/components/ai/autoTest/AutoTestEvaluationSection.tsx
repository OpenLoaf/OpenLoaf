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
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import type { AutoTestEvaluation } from "@openloaf/api";
import {
  AutoTestBadge,
  AutoTestScorePill,
  verdictChipClass,
  verdictLabel,
} from "./AutoTestBadge";

interface AutoTestEvaluationSectionProps {
  sessionId: string;
}

/** 格式化 elapsed ms 为人类可读文字。 */
function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes}m${rest}s`;
}

/**
 * AI 调试面板内的自动测试评分区块。仅在会话被标记为 autoTest 时由外层渲染。
 * 读取后端 chat.getAutoTestEvaluation（由 ai-browser-test evaluator 子 agent 写入的 EVALUATION.json）。
 */
export function AutoTestEvaluationSection({ sessionId }: AutoTestEvaluationSectionProps) {
  const query = useQuery({
    ...trpc.chat.getAutoTestEvaluation.queryOptions({ sessionId }),
    enabled: Boolean(sessionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const evaluation = query.data;

  return (
    <div className="border-b bg-blue-50/40 px-4 py-3 dark:bg-blue-500/5">
      <div className="mb-2 flex items-center gap-2">
        <AutoTestBadge size="sm" showLabel />
        <span className="text-sm font-medium text-foreground">自动测试评分</span>
        {evaluation ? (
          <AutoTestScorePill
            score={evaluation.aggregate.score}
            verdict={evaluation.aggregate.verdict}
          />
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="text-xs text-muted-foreground">评审生成中…</div>
      ) : query.isError ? (
        <div className="text-xs text-destructive">读取评审失败：{String(query.error)}</div>
      ) : !evaluation ? (
        <div className="text-xs text-muted-foreground">子 agent 评审尚未写入</div>
      ) : (
        <AutoTestEvaluationBody evaluation={evaluation} />
      )}
    </div>
  );
}

interface AutoTestEvaluationBodyProps {
  evaluation: AutoTestEvaluation;
}

function AutoTestEvaluationBody({ evaluation }: AutoTestEvaluationBodyProps) {
  const { aggregate, evaluators, runner, createdAt } = evaluation;

  return (
    <div className="flex flex-col gap-3">
      {/* Aggregate 指标网格 */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-background/60 p-3 text-xs sm:grid-cols-4">
        <Metric label="裁决" value={verdictLabel(aggregate.verdict)} />
        <Metric label="评分" value={`${Math.round(aggregate.score)} / 100`} />
        <Metric label="轮次" value={String(aggregate.rounds)} />
        <Metric label="耗时" value={formatElapsed(aggregate.elapsedMs)} />
        <Metric label="总 tokens" value={aggregate.tokensTotal?.toLocaleString() ?? "—"} />
        <Metric
          label="输入/输出"
          value={
            aggregate.tokensInput == null && aggregate.tokensOutput == null
              ? "—"
              : `${aggregate.tokensInput?.toLocaleString() ?? "—"} / ${aggregate.tokensOutput?.toLocaleString() ?? "—"}`
          }
        />
        <Metric label="模型" value={aggregate.model ?? "—"} />
        <Metric label="Runner" value={runner} />
      </div>

      {aggregate.summary ? (
        <p className="text-xs text-foreground/85 leading-relaxed">{aggregate.summary}</p>
      ) : null}

      {aggregate.toolCalls.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">工具调用</span>
          {aggregate.toolCalls.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="inline-flex h-5 items-center rounded-full bg-violet-100 px-2 text-[11px] font-medium text-violet-700 transition-colors duration-150 dark:bg-violet-500/15 dark:text-violet-300"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}

      {/* Evaluators 折叠列表 */}
      <div className="flex flex-col gap-2">
        {evaluators.map((evaluator, i) => (
          <EvaluatorCard key={`${evaluator.name}-${i}`} evaluator={evaluator} defaultOpen={i === 0} />
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground/70 tabular-nums">
        生成时间 {new Date(createdAt).toLocaleString()}
      </div>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className="truncate text-[12px] font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

interface EvaluatorCardProps {
  evaluator: AutoTestEvaluation["evaluators"][number];
  defaultOpen?: boolean;
}

function EvaluatorCard({ evaluator, defaultOpen = false }: EvaluatorCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors duration-150 hover:bg-accent/40"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate font-medium text-foreground">{evaluator.name}</span>
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium transition-colors duration-150",
            verdictChipClass(evaluator.verdict),
          )}
        >
          {verdictLabel(evaluator.verdict)}
        </span>
        <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[10px] font-medium tabular-nums text-foreground/80">
          {Math.round(evaluator.score)}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-2 text-xs">
          {evaluator.pros.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                优点
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-foreground/85">
                {evaluator.pros.map((pro, i) => (
                  <li key={i}>{pro}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {evaluator.cons.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400">
                缺点
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-foreground/85">
                {evaluator.cons.map((con, i) => (
                  <li key={i}>{con}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {evaluator.evidence.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                证据
              </div>
              <ul className="space-y-0.5 text-foreground/85">
                {evaluator.evidence.map((item, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1">
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground/80">
                      {item.file}
                    </code>
                    {item.note ? <span className="text-muted-foreground">— {item.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
