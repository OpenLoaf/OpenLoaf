/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { Button } from "@openloaf/ui/button";
import { Calendar } from "@openloaf/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Skeleton } from "@openloaf/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { CalendarDays } from "lucide-react";
import { trpc } from "@/utils/trpc";

type ProjectGitSettingsProps = {
  /** Project id. */
  projectId?: string;
  /** Project root uri. */
  rootUri?: string;
};

/** Copy text to clipboard with a fallback. */
async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

/** Build a display label for a git author. */
function formatGitAuthorLabel(
  name?: string | null,
  email?: string | null
): string {
  const trimmedName = name?.trim() ?? "";
  const trimmedEmail = email?.trim() ?? "";
  if (trimmedName && trimmedEmail && trimmedName !== trimmedEmail) {
    return `${trimmedName} <${trimmedEmail}>`;
  }
  if (trimmedName) return trimmedName;
  if (trimmedEmail) return trimmedEmail;
  return "未知作者";
}

/** Build a compact display label for a git author. */
function formatGitAuthorDisplay(
  name?: string | null,
  email?: string | null
): string {
  const trimmedName = name?.trim() ?? "";
  const trimmedEmail = email?.trim() ?? "";
  if (trimmedName) return trimmedName;
  if (trimmedEmail) return trimmedEmail;
  return "未知作者";
}

/** Format commit date for list display. */
function formatCommitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Project git settings panel. */
const ProjectGitSettings = memo(function ProjectGitSettings({
  projectId,
}: ProjectGitSettingsProps) {
  const gitInfoQuery = useQuery({
    ...trpc.project.getGitInfo.queryOptions(projectId ? { projectId } : skipToken),
    staleTime: 5000,
  });
  const branchesQuery = useQuery({
    ...trpc.project.getGitBranches.queryOptions(
      projectId ? { projectId } : skipToken
    ),
    staleTime: 5000,
  });
  const gitInfo = gitInfoQuery.data;
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string>("all");
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const branches = branchesQuery.data?.branches ?? [];
  const currentBranch = branchesQuery.data?.currentBranch ?? null;
  const commitQuery = useInfiniteQuery({
    ...trpc.project.getGitCommits.infiniteQueryOptions(
      projectId && activeBranch
        ? { projectId, branch: activeBranch, pageSize: 30 }
        : skipToken,
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        staleTime: 5000,
      }
    ),
  });
  const commitItems = useMemo(
    () => commitQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [commitQuery.data]
  );
  const authorOptions = useMemo(() => {
    // 逻辑：从已加载提交中提取作者选项。
    const map = new Map<string, { label: string; value: string }>();
    for (const commit of commitItems) {
      const value = formatGitAuthorLabel(commit.authorName, commit.authorEmail);
      if (value === "未知作者") continue;
      const label = formatGitAuthorDisplay(
        commit.authorName,
        commit.authorEmail
      );
      map.set(value, { label, value });
    }
    return Array.from(map.values());
  }, [commitItems]);
  const filteredCommitItems = useMemo(() => {
    // 逻辑：按作者与时间区间过滤当前提交列表。
    const rangeStart = selectedRange?.from
      ? new Date(
          selectedRange.from.getFullYear(),
          selectedRange.from.getMonth(),
          selectedRange.from.getDate(),
          0,
          0,
          0,
          0
        )
      : null;
    const rangeEnd = selectedRange?.to
      ? new Date(
          selectedRange.to.getFullYear(),
          selectedRange.to.getMonth(),
          selectedRange.to.getDate(),
          23,
          59,
          59,
          999
        )
      : null;

    return commitItems.filter((commit) => {
      const authorLabel = formatGitAuthorLabel(
        commit.authorName,
        commit.authorEmail
      );
      if (selectedAuthor !== "all" && authorLabel !== selectedAuthor) {
        return false;
      }
      if (rangeStart || rangeEnd) {
        const timestamp = new Date(commit.authoredAt);
        if (Number.isNaN(timestamp.getTime())) return false;
        if (rangeStart && timestamp < rangeStart) return false;
        if (rangeEnd && timestamp > rangeEnd) return false;
      }
      return true;
    });
  }, [commitItems, selectedAuthor, selectedRange]);
  const isFilterActive =
    selectedAuthor !== "all" || Boolean(selectedRange?.from || selectedRange?.to);

  const rangeLabel = useMemo(() => {
    if (!selectedRange?.from && !selectedRange?.to) return "全部时间";
    const formatLabel = (value: Date) => format(value, "yyyy-MM-dd");
    if (selectedRange?.from && selectedRange?.to) {
      return `${formatLabel(selectedRange.from)} ~ ${formatLabel(selectedRange.to)}`;
    }
    if (selectedRange?.from) {
      return `${formatLabel(selectedRange.from)} ~`;
    }
    if (selectedRange?.to) {
      return `~ ${formatLabel(selectedRange.to)}`;
    }
    return "全部时间";
  }, [selectedRange]);

  const gitUserLabel = useMemo(() => {
    const name = gitInfo?.userName?.trim() ?? "";
    const email = gitInfo?.userEmail?.trim() ?? "";
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    if (email) return email;
    return "-";
  }, [gitInfo?.userEmail, gitInfo?.userName]);
  const baseValueClass =
    "flex-1 text-right text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-default disabled:no-underline disabled:text-muted-foreground";
  const baseValueTruncateClass = `${baseValueClass} truncate`;
  const baseValueWrapClass = `${baseValueClass} break-all`;

  useEffect(() => {
    // 中文注释：分支列表更新时，保持当前分支有效。
    if (!currentBranch && branches.length === 0) return;
    setActiveBranch((prev) => {
      if (prev && branches.some((branch) => branch.name === prev)) return prev;
      return currentBranch ?? branches[0]?.name ?? null;
    });
  }, [branches, currentBranch]);

  useEffect(() => {
    // 中文注释：滚动触底时自动加载下一页。
    const target = loadMoreRef.current;
    if (!target) return;
    if (!commitQuery.hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (commitQuery.isFetchingNextPage) return;
        void commitQuery.fetchNextPage();
      },
      { rootMargin: "200px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [commitQuery.fetchNextPage, commitQuery.hasNextPage, commitQuery.isFetchingNextPage]);

  return (
    <div className="space-y-4">
      <OpenLoafSettingsGroup title="Git 信息" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">当前分支</div>
            <div className="text-xs text-muted-foreground">Git 分支名称</div>
          </div>

          <OpenLoafSettingsField>
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={!gitInfo?.branch}
              onClick={async () => {
                if (!gitInfo?.branch) return;
                await copyToClipboard(gitInfo.branch);
                toast.success("已复制当前分支");
              }}
              title={gitInfo?.branch ?? "-"}
            >
              {gitInfo?.branch ?? "-"}
            </button>
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">远程 origin</div>
            <div className="text-xs text-muted-foreground">远程仓库地址</div>
          </div>

          <OpenLoafSettingsField>
            <button
              type="button"
              className={baseValueWrapClass}
              disabled={!gitInfo?.originUrl}
              onClick={async () => {
                if (!gitInfo?.originUrl) return;
                await copyToClipboard(gitInfo.originUrl);
                toast.success("已复制远程地址");
              }}
              title={gitInfo?.originUrl ?? "-"}
            >
              {gitInfo?.originUrl ?? "-"}
            </button>
          </OpenLoafSettingsField>
        </div>

        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">Git 用户</div>
            <div className="text-xs text-muted-foreground">本地优先，缺失用全局</div>
          </div>

          <OpenLoafSettingsField>
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={gitUserLabel === "-"}
              onClick={async () => {
                if (gitUserLabel === "-") return;
                await copyToClipboard(gitUserLabel);
                toast.success("已复制 Git 用户");
              }}
              title={gitUserLabel}
            >
              {gitUserLabel}
            </button>
          </OpenLoafSettingsField>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup
        title="提交历史"
        subtitle={
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="w-48">
              <Select
                value={activeBranch ?? ""}
                onValueChange={(value) => setActiveBranch(value)}
                disabled={branchesQuery.isLoading || branches.length === 0}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue
                    placeholder={
                      branchesQuery.isLoading ? "加载分支中" : "选择分支"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      {branch.name}
                      {branch.isCurrent ? "（当前）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Select
                value={selectedAuthor}
                onValueChange={(value) => setSelectedAuthor(value)}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="选择用户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部用户</SelectItem>
                  {authorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 w-56 justify-start gap-2 px-3 text-xs"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <span
                      className={
                        selectedRange?.from || selectedRange?.to
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {rangeLabel}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={selectedRange}
                  onSelect={setSelectedRange}
                  disabled={{ after: new Date() }}
                  initialFocus
                />
                  <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                    <span className="text-xs text-muted-foreground">时间区间</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedRange(undefined)}
                    >
                      清除
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        }
        subtitleClassName="pt-1 w-full"
        cardProps={{ padding: "x" }}
      >
        <div className="py-3">
          {!activeBranch ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {branchesQuery.isLoading
                ? "加载分支中"
                : branchesQuery.isError
                  ? "获取分支失败"
                  : "暂无可用分支"}
            </div>
          ) : null}

          {activeBranch && commitQuery.isError ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              获取提交历史失败
            </div>
          ) : null}

          {activeBranch && !commitQuery.isError && commitQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`git-commit-skeleton-${index}`} className="relative pl-6">
                  <div className="absolute left-2 top-0 h-full w-px bg-border/60" />
                  <div className="absolute left-[5px] top-2 h-2 w-2 rounded-full bg-muted-foreground/60" />
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeBranch &&
          !commitQuery.isError &&
          !commitQuery.isLoading &&
          filteredCommitItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {isFilterActive ? "暂无匹配提交" : "暂无提交记录"}
            </div>
          ) : null}

          {activeBranch &&
          !commitQuery.isError &&
          filteredCommitItems.length > 0 ? (
            <div className="relative space-y-2">
              <div className="absolute left-2 top-0 h-full w-px bg-border/60" />
              {filteredCommitItems.map((commit) => {
                const fullAuthorLabel = formatGitAuthorLabel(
                  commit.authorName,
                  commit.authorEmail
                );
                const displayAuthorLabel = formatGitAuthorDisplay(
                  commit.authorName,
                  commit.authorEmail
                );
                return (
                  <div
                    key={commit.oid}
                    className="relative flex items-start gap-3 rounded-md px-1 py-2 pl-6 transition hover:bg-accent/40"
                  >
                    <div className="absolute left-[5px] top-4 h-2 w-2 rounded-full bg-muted-foreground/70" />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {commit.summary}
                        </div>
                        <div
                          className="mt-1 text-xs text-muted-foreground"
                          title={fullAuthorLabel}
                        >
                          {displayAuthorLabel} · {formatCommitDate(commit.authoredAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div className="font-mono">{commit.shortOid}</div>
                        <div className="mt-1">
                          {(commit.filesChanged ?? 0).toLocaleString()} files ·{" "}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{(commit.insertions ?? 0).toLocaleString()}
                          </span>{" "}
                          <span className="text-rose-600 dark:text-rose-400">
                            -{(commit.deletions ?? 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {activeBranch && commitQuery.isFetchingNextPage ? (
            <div className="py-3">
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : null}

          <div ref={loadMoreRef} className="h-4" />
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
});

export { ProjectGitSettings };
