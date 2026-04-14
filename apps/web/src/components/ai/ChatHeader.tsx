/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Bug, FolderOpen, History, Lightbulb, MessageSquarePlus, Palette, X } from "lucide-react";
import SessionList from "@/components/ai/session/SessionList";
import * as React from "react";
import { useChatActions, useChatSession, useChatStatus, useChatMessageMeta } from "./context";
import { skipToken, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { useAppView } from "@/hooks/use-app-view";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useAppState } from "@/hooks/use-app-state";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { useProject } from "@/hooks/use-project";
import { useProjectStorageRootUri, useTempStorageRootUri } from "@/hooks/use-project-storage-root-uri";
import { toast } from "sonner";
import { SaaSHttpError } from "@openloaf-saas/sdk";
import { getSaasMediaClient } from "@/lib/saas-media-client";
import { uploadFeedbackAttachmentViaProxy } from "@/lib/saas-feedback-upload";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { TooltipProvider } from "@openloaf/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Textarea } from "@openloaf/ui/textarea";
import { Button } from "@openloaf/ui/button";
import { resolveSaasBaseUrl } from "@/lib/saas-auth";
import { resolveServerUrl } from "@/utils/server-url";
import { isElectronEnv } from "@/utils/is-electron-env";
import { CopyChatToCanvasDialog } from "./CopyChatToCanvasDialog";
import { buildChatAssetFolderDescriptor } from "./utils/chat-asset-folder";
import { AutoTestBadge, AutoTestScorePill } from "./autoTest/AutoTestBadge";

interface ChatHeaderProps {
  onNewSession?: () => void;
  onCloseSession?: () => void;
  /** Icon color palette for header action buttons. */
  iconPalette?: "default" | "email";
  /** Control whether the header keeps session history / switching UI enabled. */
  enableMultiSession?: boolean;
}

const CHAT_HEADER_EMAIL_ICON_CLASS = {
  debug: "text-muted-foreground",
  feedback: "text-muted-foreground",
  copyToCanvas:
    "text-muted-foreground hover:text-foreground",
  asset: "text-muted-foreground hover:text-foreground",
  closeDock: "text-muted-foreground",
  plan: "text-muted-foreground hover:text-foreground",
  clear: "text-muted-foreground",
  history: "text-muted-foreground",
  close: "text-muted-foreground",
} as const;

function ChatHeaderInner({
  onNewSession,
  onCloseSession,
  iconPalette = "default",
  enableMultiSession,
}: ChatHeaderProps) {
  const { t: tAi } = useTranslation('ai');
  const { sessionId: activeSessionId, tabId, leafMessageId: activeLeafMessageId } = useChatSession();
  const { newSession, selectSession } = useChatActions();
  const { status } = useChatStatus();
  const { messageCount, lastUserMessageId: metaLastUserMessageId } = useChatMessageMeta();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  /** Preface button loading state. */
  const [prefaceLoading, setPrefaceLoading] = React.useState(false);
  /** Chat feedback dialog open state. */
  const [chatFeedbackOpen, setChatFeedbackOpen] = React.useState(false);
  /** Copy current chat into a board dialog state. */
  const [copyToCanvasOpen, setCopyToCanvasOpen] = React.useState(false);
  /** Chat feedback input content. */
  const [chatFeedbackContent, setChatFeedbackContent] = React.useState("");
  /** Chat feedback submitting state. */
  const [chatFeedbackSubmitting, setChatFeedbackSubmitting] = React.useState(false);
  const menuLockRef = React.useRef(false);
  // 项目模式下按项目过滤会话，全局模式下查全量。
  const projectShell = useAppView((s) => s.projectShell);
  const shellProjectId = projectShell?.projectId?.trim() || "";
  const sessionsListInput = React.useMemo(
    () => shellProjectId
      ? { projectId: shellProjectId, boardId: null as string | null }
      : { boardId: null as string | null },
    [shellProjectId],
  );
  const isTabActive = useTabActive();
  const sessionsQuery = useInfiniteQuery({
    ...trpc.chat.listSessions.infiniteQueryOptions(
      isTabActive ? sessionsListInput : skipToken,
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sessions = React.useMemo(
    () => sessionsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [sessionsQuery.data],
  );
  const refetchSessions = sessionsQuery.refetch;
  const setTitle = useAppView((s) => s.setTitle);
  const setChatParams = useAppView((s) => s.setChatParams);
  const pushStackItem = useLayoutState((s) => s.pushStackItem);
  const { basic } = useBasicConfig();
  const { loggedIn: saasLoggedIn } = useSaasAuth();
  const appState = useAppState();

  // 当前会话标题：从 sessions 列表中匹配当前 activeSessionId
  const sessionTitle = React.useMemo(() => {
    if (!activeSessionId) return "";
    const current = sessions.find((s) => s.id === activeSessionId);
    return current?.title?.trim() || "";
  }, [activeSessionId, sessions]);

  // chat-probe 自动测试标记：单独用 getSession 查询（listSessions 返回不含 autoTest 字段）。
  const activeSessionMetaQuery = useQuery({
    ...trpc.chat.getSession.queryOptions(
      activeSessionId ? { sessionId: activeSessionId } : skipToken,
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const isAutoTestSession = Boolean(activeSessionMetaQuery.data?.autoTest);

  // chat-probe 自动测试评分（读取 EVALUATION.json），只在标记为 autoTest 的会话上拉取。
  const autoTestEvalQuery = useQuery({
    ...trpc.chat.getAutoTestEvaluation.queryOptions(
      activeSessionId ? { sessionId: activeSessionId } : skipToken,
    ),
    enabled: Boolean(isAutoTestSession && activeSessionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const autoTestAggregate = autoTestEvalQuery.data?.aggregate;

  // Quick launch: derive project context from tab chatParams.
  const quickLaunchProjectId = React.useMemo(() => {
    const params = appState?.chatParams as Record<string, unknown> | undefined;
    const pid = params?.projectId;
    return typeof pid === "string" ? pid.trim() : "";
  }, [appState?.chatParams]);
  const currentBoardId = React.useMemo(() => {
    const params = appState?.chatParams as Record<string, unknown> | undefined;
    const boardId = params?.boardId;
    return typeof boardId === "string" ? boardId.trim() : "";
  }, [appState?.chatParams]);
  const projectQuery = useProject(quickLaunchProjectId || undefined);
  const globalRootUri = useProjectStorageRootUri();
  const tempRootUri = useTempStorageRootUri();
  /** Resolve icon tone classes for header actions. */
  const resolveActionIconClass = React.useCallback(
    (action: keyof typeof CHAT_HEADER_EMAIL_ICON_CLASS) =>
      iconPalette === "email" ? CHAT_HEADER_EMAIL_ICON_CLASS[action] : "",
    [iconPalette]
  );

  /** Resolve request leaf id from active branch leaf first, then fallback to latest user message. */
  const requestLeafMessageId = React.useMemo(() => {
    const activeLeafId =
      typeof activeLeafMessageId === "string" ? activeLeafMessageId.trim() : "";
    if (activeLeafId) return activeLeafId;
    return metaLastUserMessageId;
  }, [activeLeafMessageId, metaLastUserMessageId]);

  // 逻辑：仅在存在历史消息时显示 Preface 查看按钮。
  const showPrefaceButton = Boolean(basic.chatPrefaceEnabled) && messageCount > 0;

  // 新建会话按钮显示条件：只要当前会话已有消息就始终显示，避免单会话场景缺少重开入口。
  const shouldShowNewSessionButton = messageCount > 0;

  const shouldShowHistoryButton = enableMultiSession ?? true;
  const assetFolder = React.useMemo(
    () =>
      buildChatAssetFolderDescriptor({
        sessionId: activeSessionId,
        projectId: quickLaunchProjectId || undefined,
        boardId: currentBoardId || undefined,
      }),
    [activeSessionId, currentBoardId, quickLaunchProjectId],
  );
  const assetRootUri = React.useMemo(() => {
    const shellRootUri = projectShell?.rootUri?.trim();
    if (quickLaunchProjectId) {
      return shellRootUri || projectQuery.data?.project?.rootUri?.trim() || "";
    }
    // 临时对话：文件存储在 tempDir 下，不是 ~/.openloaf/
    return tempRootUri?.trim() || globalRootUri?.trim() || "";
  }, [globalRootUri, tempRootUri, projectQuery.data?.project?.rootUri, projectShell?.rootUri, quickLaunchProjectId]);
  // 临时对话（无 projectId）：通过 rootUri 告知 fs 路由使用 tempDir 而非 ~/.openloaf/ 作为根。
  const fsRootUri = !quickLaunchProjectId && tempRootUri ? tempRootUri : undefined;
  const assetFolderQuery = useQuery(
    trpc.fs.list.queryOptions(
      assetFolder?.relativePath
        ? {
            projectId: quickLaunchProjectId || undefined,
            rootUri: fsRootUri,
            uri: assetFolder.relativePath,
          }
        : skipToken,
    ),
  );
  const assetEntries = assetFolderQuery.data?.entries ?? [];
  const refetchAssetFolder = assetFolderQuery.refetch;
  const shouldShowAssetFolderButton =
    messageCount > 0 &&
    Boolean(assetFolder?.relativePath) &&
    Boolean(assetRootUri) &&
    assetEntries.length > 0;

  const effectiveChatFeedbackOpen = chatFeedbackOpen && saasLoggedIn;

  const syncHistoryTitleToTabTitle = useMutation({
    ...(trpc.chatsession.updateManyChatSession.mutationOptions() as any),
    onSuccess: () => {
      invalidateChatSessions(queryClient);
    },
  });

  const handleMenuOpenChange = (open: boolean) => {
    menuLockRef.current = open;
    if (open) setHistoryOpen(true);
  };

  React.useEffect(() => {
    if (!assetFolder?.relativePath) return;
    if (messageCount === 0) return;
    void refetchAssetFolder();
  }, [activeSessionId, assetFolder?.relativePath, messageCount, refetchAssetFolder, status]);

  /**
   * Open the current session preface in a markdown stack panel.
   */
  const handleViewPreface = React.useCallback(async () => {
    if (!activeSessionId) {
      toast.error("未找到当前会话");
      return;
    }
    if (prefaceLoading) return;

    setPrefaceLoading(true);
    try {
      const res = await trpcClient.chat.getSessionPreface.query({
        sessionId: activeSessionId,
        leafMessageId: requestLeafMessageId,
      });
      const content = typeof res?.content === "string" ? res.content : "";
      const jsonlPath = typeof res?.jsonlPath === "string" ? res.jsonlPath : "";
      const promptContent = typeof res?.promptContent === "string" ? res.promptContent : "";
      const panelKey = `preface:${activeSessionId}`;
      pushStackItem({
        id: panelKey,
        sourceKey: panelKey,
        component: "ai-debug-viewer",
        title: "AI调试",
        params: {
          prefaceContent: content,
          promptContent,
          sessionId: activeSessionId,
          jsonlPath: jsonlPath || undefined,
          __customHeader: true,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取调试信息失败";
      toast.error(message);
    } finally {
      setPrefaceLoading(false);
    }
  }, [activeSessionId, prefaceLoading, pushStackItem, requestLeafMessageId]);

  /** Resolve server endpoint for exporting current chat session zip. */
  const resolveSessionZipExportUrl = React.useCallback((sessionId: string) => {
    const encodedSessionId = encodeURIComponent(sessionId);
    const apiBase = resolveServerUrl();
    if (!apiBase) return `/chat/sessions/${encodedSessionId}/export-zip`;
    return `${apiBase}/chat/sessions/${encodedSessionId}/export-zip`;
  }, []);

  /** Build feedback context for SaaS submission. */
  const buildChatFeedbackContext = React.useCallback(async (zipInfo: {
    url: string;
    key: string;
    bytes: number;
    exportMode?: string;
    sourceBytes?: number;
  }) => {
    const appVersion = isElectronEnv()
      ? await window.openloafElectron?.getAppVersion?.().catch(() => null)
      : null;
    const context: Record<string, unknown> = {
      env: isElectronEnv() ? "electron" : "web",
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      appVersion: typeof appVersion === "string" ? appVersion : undefined,
      tabId: tabId || undefined,
      sessionId: activeSessionId || undefined,
      leafMessageId: requestLeafMessageId,
      projectId: quickLaunchProjectId || undefined,
      messageCount: messageCount,
      chatSessionZipUrl: zipInfo.url,
      chatSessionZipKey: zipInfo.key,
      chatSessionZipBytes: zipInfo.bytes,
      chatSessionZipExportMode: zipInfo.exportMode,
      chatSessionSourceBytes: zipInfo.sourceBytes,
    };
    return Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined && value !== null),
    );
  }, [
    activeSessionId,
    messageCount,
    quickLaunchProjectId,
    requestLeafMessageId,
    tabId,
  ]);

  /** Open the current chat asset folder in a filesystem stack panel. */
  const handleOpenAssetFolder = React.useCallback(() => {
    if (!assetFolder?.relativePath || !assetRootUri) return;
    const panelKey = `chat-asset:${quickLaunchProjectId || "global"}:${assetFolder.relativePath}`;
    pushStackItem({
      id: panelKey,
      sourceKey: panelKey,
      component: "project-filesystem-panel",
      title: tAi(assetFolder.labelKey),
      params: {
        projectId: quickLaunchProjectId || undefined,
        rootUri: assetRootUri,
        currentUri: assetFolder.relativePath,
        openUri: assetFolder.relativePath,
      },
    });
  }, [assetFolder?.labelKey, assetFolder?.relativePath, assetRootUri, pushStackItem, quickLaunchProjectId, tAi]);

  /** Submit feedback payload to SaaS via reverse proxy. */
  const submitChatFeedbackPayload = React.useCallback(async (input: {
    content: string;
    context: Record<string, unknown>;
  }) => {
    const client = getSaasMediaClient();
    await client.feedback.submit({
      source: "openloaf",
      type: "chat",
      content: input.content,
      context: input.context,
    });
  }, []);

  /** Submit chat feedback with current session zip attachment. */
  const handleSubmitChatFeedback = React.useCallback(async () => {
    const sessionId = typeof activeSessionId === "string" ? activeSessionId.trim() : "";
    if (!sessionId) {
      toast.error(tAi("chatFeedback.sessionMissing"));
      return;
    }
    const content = chatFeedbackContent.trim();
    if (!content) {
      toast.error(tAi("chatFeedback.emptyError"));
      return;
    }
    const baseUrl = resolveSaasBaseUrl();
    if (!baseUrl) {
      toast.error(tAi("chatFeedback.saasNotConfigured"));
      return;
    }

    setChatFeedbackSubmitting(true);
    try {
      const exportUrl = resolveSessionZipExportUrl(sessionId);
      const exportResponse = await fetch(exportUrl, { method: "GET" });
      if (!exportResponse.ok) {
        const responseText = await exportResponse.text().catch(() => "");
        const message = responseText.trim() || `HTTP ${exportResponse.status}`;
        throw new Error(`export:${message}`);
      }
      const zipBlob = await exportResponse.blob();
      if (zipBlob.size <= 0) {
        toast.error(tAi("chatFeedback.zipEmpty"));
        return;
      }

      const attachment = await uploadFeedbackAttachmentViaProxy(
        zipBlob,
        `chat-session-${sessionId}.zip`,
      );
      const context = await buildChatFeedbackContext({
        url: attachment.url,
        key: attachment.key,
        bytes: zipBlob.size,
        exportMode: exportResponse.headers.get("X-OpenLoaf-Export-Mode") ?? undefined,
        sourceBytes: Number(exportResponse.headers.get("X-OpenLoaf-Source-Bytes") ?? 0) || undefined,
      });
      await submitChatFeedbackPayload({ content, context });

      toast.success(tAi("chatFeedback.success"));
      setChatFeedbackContent("");
      setChatFeedbackOpen(false);
    } catch (error) {
      if (error instanceof SaaSHttpError) {
        const payload = error.payload as { message?: unknown } | undefined;
        const message = typeof payload?.message === "string" ? payload.message : "";
        toast.error(
          message
            ? tAi("chatFeedback.failedWithMessage", { message })
            : tAi("chatFeedback.failed"),
        );
        return;
      }
      if (error instanceof Error && error.message.startsWith("export:")) {
        const message = error.message.slice("export:".length).trim();
        toast.error(
          message
            ? tAi("chatFeedback.exportFailedWithMessage", { message })
            : tAi("chatFeedback.exportFailed"),
        );
        return;
      }
      if (error instanceof Error && error.message.trim()) {
        toast.error(tAi("chatFeedback.failedWithMessage", { message: error.message.trim() }));
        return;
      }
      toast.error(tAi("chatFeedback.failed"));
    } finally {
      setChatFeedbackSubmitting(false);
    }
  }, [
    activeSessionId,
    buildChatFeedbackContext,
    chatFeedbackContent,
    resolveSessionZipExportUrl,
    submitChatFeedbackPayload,
    tAi,
  ]);

  return (
    <>
      <div className="flex items-center px-2 pt-1.5 gap-1">
        {sessionTitle && messageCount > 0 ? (
          <div className="min-w-0 flex-1 flex items-center gap-1.5 pl-1">
            <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
              {sessionTitle}
            </span>
            {isAutoTestSession ? <AutoTestBadge /> : null}
            {isAutoTestSession && autoTestAggregate ? (
              <AutoTestScorePill
                score={autoTestAggregate.score}
                verdict={autoTestAggregate.verdict}
              />
            ) : null}
          </div>
        ) : <div className="flex-1" />}
        <TooltipProvider delayDuration={300}>
        <MessageActions className="min-w-0 shrink-0 justify-end gap-0">
          {showPrefaceButton ? (
            <MessageAction
              aria-label="View Debug Context"
              onClick={handleViewPreface}
              disabled={prefaceLoading}
              className={cn("ml-0.5 shrink-0", resolveActionIconClass("debug"))}
              tooltip="查看上下文调试信息"
              label="查看上下文调试信息"
            >
              <Bug size={16} />
            </MessageAction>
          ) : null}
          {saasLoggedIn && messageCount > 0 ? (
            <MessageAction
              aria-label={tAi("chatFeedback.button")}
              onClick={() => setChatFeedbackOpen(true)}
              className={cn("shrink-0", resolveActionIconClass("feedback"))}
              disabled={chatFeedbackSubmitting || !activeSessionId}
              tooltip={tAi("chatFeedback.button")}
              label={tAi("chatFeedback.button")}
            >
              <Lightbulb size={16} />
            </MessageAction>
          ) : null}
          {messageCount > 0 && activeSessionId ? (
            <MessageAction
              aria-label={tAi("copyToCanvas.button")}
              onClick={() => setCopyToCanvasOpen(true)}
              className={cn("shrink-0", resolveActionIconClass("copyToCanvas"))}
              tooltip={tAi("copyToCanvas.button")}
              label={tAi("copyToCanvas.button")}
            >
              <Palette size={16} />
            </MessageAction>
          ) : null}
          {shouldShowAssetFolderButton && assetFolder ? (
            <MessageAction
              aria-label={tAi(assetFolder.labelKey)}
              onClick={handleOpenAssetFolder}
              className={cn("shrink-0", resolveActionIconClass("asset"))}
              tooltip={tAi(assetFolder.labelKey)}
              label={tAi(assetFolder.labelKey)}
            >
              <FolderOpen size={18} />
            </MessageAction>
          ) : null}
{shouldShowNewSessionButton ? (
            <MessageAction
              aria-label="重新开始会话"
              className={resolveActionIconClass("clear")}
              onClick={() => {
                setHistoryOpen(false);
                menuLockRef.current = false;
                if (onNewSession) {
                  onNewSession();
                  return;
                }
                newSession();
              }}
              tooltip="重新开始会话"
              label="重新开始会话"
            >
              <MessageSquarePlus size={20} />
            </MessageAction>
          ) : null}
          {shouldShowHistoryButton ? (
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <PopoverTrigger asChild>
                <MessageAction
                  aria-label="History"
                  className={resolveActionIconClass("history")}
                  onClick={() => {
                    void refetchSessions();
                  }}
                  tooltip="历史会话"
                  label="历史会话"
                >
                  <History size={20} />
                </MessageAction>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                className="flex w-80 max-h-[min(80svh,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-2"
                onInteractOutside={(e) => {
                  if (menuLockRef.current) e.preventDefault();
                }}
              >
                <SessionList
                  tabId={tabId}
                  activeSessionId={activeSessionId}
                  externalSessions={sessions as any}
                  externalLoading={sessionsQuery.isLoading}
                  hasMore={Boolean(sessionsQuery.hasNextPage)}
                  isFetchingNextPage={sessionsQuery.isFetchingNextPage}
                  onLoadMore={() => void sessionsQuery.fetchNextPage()}
                  onMenuOpenChange={handleMenuOpenChange}
                  onSelect={(session) => {
                    setHistoryOpen(false);
                    menuLockRef.current = false;
                    const hasTabBase = Boolean(appState?.base);
                    const tabTitle = String(appState?.title ?? "").trim();
                    const selectedSessionMeta = sessions.find((item) => item.id === session.id);
                    const isSelectedUserRename = Boolean(selectedSessionMeta?.isUserRename);
                    if (
                      !hasTabBase &&
                      tabTitle.length > 0 &&
                      !isSelectedUserRename &&
                      (session.name.trim().length === 0 || session.name.trim() === "新对话")
                    ) {
                      syncHistoryTitleToTabTitle.mutate({
                        where: { id: session.id, isUserRename: false },
                        data: { title: tabTitle },
                      } as any);
                    }
                    {
                      const nextTitle = session.name.trim() || tAi("dock.aiAssistant");
                      setTitle(nextTitle);
                    }
                    setChatParams({
                      projectId: selectedSessionMeta?.projectId ?? undefined,
                      boardId: undefined,
                    });
                    selectSession(session.id);
                  }}
                />
              </PopoverContent>
            </Popover>
          ) : null}
          {onCloseSession ? (
            <MessageAction
              aria-label="关闭会话"
              className={resolveActionIconClass("close")}
              onClick={onCloseSession}
              tooltip="关闭会话"
              label="关闭会话"
            >
              <X size={20} />
            </MessageAction>
          ) : null}
        </MessageActions>
        </TooltipProvider>
      </div>
      <Dialog
        open={effectiveChatFeedbackOpen}
        onOpenChange={(open) => {
          if (!chatFeedbackSubmitting) setChatFeedbackOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tAi("chatFeedback.title")}</DialogTitle>
            <DialogDescription>{tAi("chatFeedback.description")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={chatFeedbackContent}
            onChange={(event) => setChatFeedbackContent(event.target.value)}
            placeholder={tAi("chatFeedback.placeholder")}
            className="min-h-[120px]"
            autoFocus
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                if (!chatFeedbackSubmitting && chatFeedbackContent.trim()) {
                  void handleSubmitChatFeedback();
                }
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setChatFeedbackOpen(false)}
              disabled={chatFeedbackSubmitting}
            >
              {tAi("chatFeedback.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitChatFeedback()}
              disabled={chatFeedbackSubmitting || chatFeedbackContent.trim().length === 0}
            >
              {chatFeedbackSubmitting
                ? tAi("chatFeedback.submitting")
                : tAi("chatFeedback.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {copyToCanvasOpen ? (
        <CopyChatToCanvasDialog
          open={copyToCanvasOpen}
          onOpenChange={setCopyToCanvasOpen}
          sourceSessionId={activeSessionId ?? ""}
        />
      ) : null}
    </>
  );
}

const ChatHeader = React.memo(ChatHeaderInner);
export default ChatHeader;
