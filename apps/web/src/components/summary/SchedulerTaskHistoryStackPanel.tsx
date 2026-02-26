/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@openloaf/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@openloaf/ui/dropdown-menu";
import { SchedulerTaskHistoryPanel } from "@/components/summary/SchedulerTaskHistoryPanel";
import { trpc } from "@/utils/trpc";

type SchedulerTaskHistoryStackPanelProps = {
  /** Optional project id filter. */
  projectId?: string;
  /** Optional workspace id filter. */
  workspaceId?: string;
  /** Scope label. */
  scope?: "project" | "workspace";
};

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "running", label: "运行中" },
  { value: "success", label: "已完成" },
  { value: "failed", label: "失败" },
] as const;

/** Stack panel for scheduler task history list. */
export const SchedulerTaskHistoryStackPanel = memo(function SchedulerTaskHistoryStackPanel({
  projectId,
  workspaceId,
  scope,
}: SchedulerTaskHistoryStackPanelProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");

  const queryInput = useMemo(() => {
    const statuses = statusFilter === "all" ? undefined : [statusFilter];
    return {
      projectId,
      workspaceId,
      statuses,
      page,
      pageSize: 20,
    };
  }, [page, projectId, statusFilter, workspaceId]);

  const historyQuery = useQuery(trpc.project.listSchedulerTaskRecords.queryOptions(queryInput));
  const total = historyQuery.data?.total ?? 0;
  const pageSize = historyQuery.data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = useMemo(() => {
    const raw = historyQuery.data?.items ?? [];
    return raw.map((item) => ({
      ...item,
      dates: Array.isArray(item.dates)
        ? item.dates.filter((value): value is string => typeof value === "string")
        : null,
      payload:
        item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
          ? (item.payload as Record<string, unknown>)
          : null,
    }));
  }, [historyQuery.data?.items]);
  const scopeLabel = scope === "workspace" ? "工作空间" : "项目";

  function handlePrevPage() {
    setPage((prev) => Math.max(1, prev - 1));
  }

  function handleNextPage() {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }

  function handleStatusChange(value: (typeof STATUS_OPTIONS)[number]["value"]) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{scopeLabel}执行历史</div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                {STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label ?? "状态"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUS_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          >
            刷新状态
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <SchedulerTaskHistoryPanel
          records={items}
          isLoading={historyQuery.isLoading}
          emptyText={`暂无${scopeLabel}执行记录`}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          共 {total} 条 · 第 {page}/{totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={page <= 1}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={page >= totalPages}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
});
