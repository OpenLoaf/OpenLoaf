import {
  memo,
  useCallback,
  useMemo,
  useState,
} from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { zhCN } from "date-fns/locale";

import MarkdownViewer from "@/components/file/MarkdownViewer";
import { openFilePreview } from "@/components/file/lib/open-file";
import { FileSystemGrid } from "@/components/project/filesystem/components/FileSystemGrid";
import { Calendar } from "@tenas-ai/ui/date-picker";
import { useChatSessions, type ChatSessionListItem } from "@/hooks/use-chat-sessions";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { type FileSystemEntry } from "@/components/project/filesystem/utils/file-system-utils";

interface ProjectHistoryProps {
  isLoading: boolean;
}

interface ProjectHistoryHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Fixed calendar size for the top-right cell. */
const GRID_CALENDAR_WIDTH_PX = 290;
const GRID_CALENDAR_HEIGHT_PX = 320;
/** Gap size in pixels for grid spacing. */
const GRID_GAP_PX = 10;

/** Format date as day key for grouping. */
function buildDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format date label for history header. */
function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

/** Resolve file name from a relative path. */
function resolveEntryName(relativePath: string): string {
  // 中文注释：提取路径的最后一段作为展示文件名。
  const parts = relativePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? relativePath;
}

/** Resolve file extension from a file name. */
function resolveEntryExt(name: string): string {
  // 中文注释：仅取最后一个点号之后的后缀，保持与文件系统一致。
  const segments = name.split(".");
  if (segments.length <= 1) return "";
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

/** Remove YAML front matter block from markdown content. */
function stripYamlFrontMatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return content;
  const match = trimmed.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  // 中文注释：隐藏 YAML Front Matter，只保留正文内容。
  return trimmed.slice(match[0].length);
}

/** Project history header. */
const ProjectHistoryHeader = memo(function ProjectHistoryHeader({
  isLoading,
  pageTitle,
}: ProjectHistoryHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">历史</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

/** Project history panel. */
const ProjectHistory = memo(function ProjectHistory({
  isLoading,
}: ProjectHistoryProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { sessions, isLoading: isSessionsLoading, scopeProjectId } = useChatSessions();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeTab = useTabs((s) =>
    s.activeTabId ? s.getTabById(s.activeTabId) : undefined
  );
  const setTabChatSession = useTabs((s) => s.setTabChatSession);
  const activeChatSessionId = activeTab?.chatSessionId;

  const { sessionsByDay, sessionDates } = useMemo(() => {
    const map = new Map<string, ChatSessionListItem[]>();
    const dates: Date[] = [];
    const seenKeys = new Set<string>();

    // 中文注释：按会话创建日期聚合，供日历标记与列表渲染。
    for (const session of sessions) {
      const createdAt = new Date(session.createdAt);
      const key = buildDateKey(createdAt);
      const list = map.get(key);
      if (list) {
        list.push(session);
      } else {
        map.set(key, [session]);
      }
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        dates.push(new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate()));
      }
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return { sessionsByDay: map, sessionDates: dates };
  }, [sessions]);

  const activeDate = selectedDate ?? new Date();
  const activeDateKey = buildDateKey(activeDate);
  const activeSessions = sessionsByDay.get(activeDateKey) ?? [];
  // 当天零点，用于禁用未来日期。
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const summaryUri = scopeProjectId ? `.tenas/summary/${activeDateKey}.md` : "";
  const summaryQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      summaryUri && workspaceId && scopeProjectId
        ? { workspaceId, projectId: scopeProjectId, uri: summaryUri }
        : skipToken
    )
  );
  const fileChangeQuery = useQuery(
    trpc.project.listFileChangesForDate.queryOptions(
      scopeProjectId
        ? { projectId: scopeProjectId, dateKey: activeDateKey, maxItems: 200 }
        : skipToken
    )
  );
  const projectQuery = useQuery(
    trpc.project.get.queryOptions(
      scopeProjectId ? { projectId: scopeProjectId } : skipToken
    )
  );
  const projectRootUri = projectQuery.data?.project?.rootUri;
  // 中文注释：读取当日汇总的 Markdown 内容，不存在时回退为空。
  const summaryContent = summaryQuery.data?.content ?? "";
  const summaryBody = stripYamlFrontMatter(summaryContent);
  const summaryMarkdown = summaryQuery.isLoading
    ? "加载中…"
    : summaryQuery.isError
      ? summaryQuery.error?.message ?? "读取失败"
      : summaryBody.trim() || "当天暂无总结";
  const fileChanges = useMemo(() => {
    const items = fileChangeQuery.data?.items ?? [];
    // 中文注释：按更新时间倒序，优先展示最新变更。
    return [...items].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [fileChangeQuery.data?.items]);
  const fileChangeEntries = useMemo<FileSystemEntry[]>(
    () =>
      fileChanges.map((item) => {
        const name = resolveEntryName(item.relativePath);
        return {
          uri: item.relativePath,
          name,
          kind: "file",
          ext: resolveEntryExt(name),
          updatedAt: item.updatedAt,
        };
      }),
    [fileChanges]
  );

  /** Select a chat session for the active tab and load its history. */
  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      if (!activeTabId) return;
      if (activeChatSessionId === sessionId) return;
      // 中文注释：点击历史会话后切换右侧聊天并加载历史记录。
      setTabChatSession(activeTabId, sessionId, { loadHistory: true });
    },
    [activeChatSessionId, activeTabId, setTabChatSession]
  );

  /** Open a markdown file from file changes. */
  const handleOpenMarkdown = useCallback(
    (entry: FileSystemEntry) => {
      openFilePreview({
        entry,
        tabId: activeTabId,
        projectId: scopeProjectId,
        rootUri: projectRootUri,
      });
    },
    [activeTabId, projectRootUri, scopeProjectId]
  );

  /** Open a code file from file changes. */
  const handleOpenCode = useCallback(
    (entry: FileSystemEntry) => {
      openFilePreview({
        entry,
        tabId: activeTabId,
        projectId: scopeProjectId,
        rootUri: projectRootUri,
      });
    },
    [activeTabId, projectRootUri, scopeProjectId]
  );

  /** Open an image file from file changes. */
  const handleOpenImage = useCallback(
    (entry: FileSystemEntry, thumbnailSrc?: string) => {
      openFilePreview({
        entry,
        tabId: activeTabId,
        projectId: scopeProjectId,
        rootUri: projectRootUri,
        thumbnailSrc,
      });
    },
    [activeTabId, projectRootUri, scopeProjectId]
  );

  /** Open a PDF file from file changes. */
  const handleOpenPdf = useCallback(
    (entry: FileSystemEntry) => {
      openFilePreview({
        entry,
        tabId: activeTabId,
        projectId: scopeProjectId,
        rootUri: projectRootUri,
      });
    },
    [activeTabId, projectRootUri, scopeProjectId]
  );

  /** Open a DOC file from file changes. */
  const handleOpenDoc = useCallback(
    (entry: FileSystemEntry) => {
      openFilePreview({
        entry,
        tabId: activeTabId,
        projectId: scopeProjectId,
        rootUri: projectRootUri,
      });
    },
    [activeTabId, projectRootUri, scopeProjectId]
  );

  /** Open a spreadsheet file from file changes. */
  const handleOpenSpreadsheet = useCallback(
    (entry: FileSystemEntry) => {
      openFilePreview({
        entry,
        tabId: activeTabId,
        projectId: scopeProjectId,
        rootUri: projectRootUri,
      });
    },
    [activeTabId, projectRootUri, scopeProjectId]
  );

  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full">
      <div
        className="relative grid h-full w-full"
        style={{
          gap: GRID_GAP_PX,
          gridTemplateColumns: `minmax(0, 1fr) ${GRID_CALENDAR_WIDTH_PX}px`,
          gridTemplateRows: `${GRID_CALENDAR_HEIGHT_PX}px minmax(0, 1fr)`,
        }}
      >
        <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="text-sm font-semibold text-foreground">当日文件变化</div>
          <div className="mt-4 flex-1 min-h-0 overflow-auto">
            {fileChangeQuery.isLoading ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : fileChangeQuery.isError ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                读取失败
              </div>
            ) : fileChangeEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                当天暂无文件变化
              </div>
            ) : (
              <FileSystemGrid
                entries={fileChangeEntries}
                isLoading={false}
                compact
                projectId={scopeProjectId}
                rootUri={projectRootUri}
                parentUri={null}
                currentUri={null}
                showEmptyActions={false}
                onOpenImage={handleOpenImage}
                onOpenMarkdown={handleOpenMarkdown}
                onOpenCode={handleOpenCode}
                onOpenPdf={handleOpenPdf}
                onOpenDoc={handleOpenDoc}
                onOpenSpreadsheet={handleOpenSpreadsheet}
              />
            )}
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col">
          <Calendar
            mode="single"
            required
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={{ after: today }}
            locale={zhCN}
            modifiers={{ hasHistory: sessionDates }}
            modifiersClassNames={{
              hasHistory:
                "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-amber-400/80 dark:after:bg-amber-300/90 after:pointer-events-none after:z-10",
            }}
            className="h-full w-full rounded-xl border border-border/60 bg-background/80 p-3"
          />
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="text-sm font-semibold text-foreground">当日总结</div>
          <div className="mt-4 flex-1 min-h-0 overflow-hidden [&_.streamdown-viewer]:!bg-transparent [&_.streamdown-viewer]:!p-0">
            <MarkdownViewer content={summaryMarkdown} />
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">历史列表</div>
            <div className="text-xs text-muted-foreground">
              {formatDateLabel(activeDate)} ·{" "}
              {isSessionsLoading ? "加载中…" : `${activeSessions.length} 项`}
            </div>
          </div>
          <div className="mt-4 flex-1 space-y-2 overflow-auto">
            {isSessionsLoading ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                当天暂无历史
              </div>
            ) : (
              activeSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  aria-pressed={activeChatSessionId === session.id}
                  onClick={() => handleSessionSelect(session.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 text-left transition-colors",
                    activeChatSessionId === session.id
                      ? "border-primary/40 bg-primary/10"
                      : "bg-background/80 hover:bg-accent/40"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                        <MessageCircle className="h-4 w-4" />
                      </div>
                      <div className="truncate text-sm font-medium text-foreground">
                        {session.title.trim() || "未命名会话"}
                      </div>
                      {session.isPin ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          置顶
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
});

export { ProjectHistoryHeader };
export default ProjectHistory;
