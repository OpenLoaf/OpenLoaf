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
import { Bug, History, Lightbulb, MessageSquarePlus, PanelLeft, X } from "lucide-react";
import { QUICK_LAUNCH_ITEMS, PROJECT_QUICK_LAUNCH_ITEMS } from "./quick-launch-items";
import { useProject } from "@/hooks/use-project";
import SessionList from "@/components/ai/session/SessionList";
import * as React from "react";
import { useChatActions, useChatSession, useChatState } from "./context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useTabView } from "@/hooks/use-tab-view";
import { invalidateChatSessions, useChatSessions } from "@/hooks/use-chat-sessions";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { toast } from "sonner";
import { SaaSClient, SaaSHttpError } from "@openloaf-saas/sdk";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
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
import { getAccessToken, resolveSaasBaseUrl } from "@/lib/saas-auth";
import { resolveServerUrl } from "@/utils/server-url";
import { isElectronEnv } from "@/utils/is-electron-env";

interface ChatHeaderProps {
  className?: string;
  onNewSession?: () => void;
  onCloseSession?: () => void;
  /** Icon color palette for header action buttons. */
  iconPalette?: "default" | "email";
  /** Enable multi-session mode (show new session button). Default: auto-detect from projectId. */
  enableMultiSession?: boolean;
}

const CHAT_HEADER_EMAIL_ICON_CLASS = {
  debug: "text-[#9334e6] dark:text-violet-300",
  feedback: "text-[#7c3aed] dark:text-violet-300",
  openDock: "text-[#188038] dark:text-emerald-300",
  closeDock: "text-[#f9ab00] dark:text-amber-300",
  clear: "text-[#188038] dark:text-emerald-300",
  history: "text-[#1a73e8] dark:text-sky-300",
  close: "text-[#5f6368] dark:text-slate-300",
} as const;

export default function ChatHeader({
  className,
  onNewSession,
  onCloseSession,
  iconPalette = "default",
  enableMultiSession,
}: ChatHeaderProps) {
  const { t: tAi } = useTranslation('ai');
  const { t: tWorkspace } = useTranslation('workspace');
  const { sessionId: activeSessionId, tabId, leafMessageId: activeLeafMessageId } = useChatSession();
  const { newSession, selectSession } = useChatActions();
  const { messages } = useChatState();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [quickLaunchOpen, setQuickLaunchOpen] = React.useState(false);
  /** Preface button loading state. */
  const [prefaceLoading, setPrefaceLoading] = React.useState(false);
  /** Chat feedback dialog open state. */
  const [chatFeedbackOpen, setChatFeedbackOpen] = React.useState(false);
  /** Chat feedback input content. */
  const [chatFeedbackContent, setChatFeedbackContent] = React.useState("");
  /** Chat feedback submitting state. */
  const [chatFeedbackSubmitting, setChatFeedbackSubmitting] = React.useState(false);
  const menuLockRef = React.useRef(false);
  const { sessions, refetch: refetchSessions } = useChatSessions({ tabId });
  const setTabTitle = useTabs((s) => s.setTabTitle);
  const setSessionProjectId = useTabs((s) => s.setSessionProjectId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const { basic } = useBasicConfig();
  const { loggedIn: saasLoggedIn } = useSaasAuth();
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const tabView = useTabView(tabId);
  const workspaceId = workspaceCompatQuery.data?.id ?? "";

  // Quick launch: derive project context from tab chatParams.
  const quickLaunchProjectId = React.useMemo(() => {
    const params = tabView?.chatParams as Record<string, unknown> | undefined;
    const pid = params?.projectId;
    return typeof pid === "string" ? pid.trim() : "";
  }, [tabView?.chatParams]);
  const { data: quickLaunchProjectData } = useProject(quickLaunchProjectId || undefined);
  const hasBase = Boolean(tabView?.base);
  // 只要有左侧面板或有消息就显示 dock 按钮；仅 full 空聊天状态（无 base + 无消息）隐藏。
  const showDockButton = hasBase || messages.length > 0;
  /** Resolve icon tone classes for header actions. */
  const resolveActionIconClass = React.useCallback(
    (action: keyof typeof CHAT_HEADER_EMAIL_ICON_CLASS) =>
      iconPalette === "email" ? CHAT_HEADER_EMAIL_ICON_CLASS[action] : "",
    [iconPalette]
  );

  const activeSession = React.useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );
  const sessionTitle = String(activeSession?.title ?? "").trim();
  const sessionIndex = React.useMemo(() => {
    const ids =
      Array.isArray(tabView?.chatSessionIds) && tabView.chatSessionIds.length > 0
        ? tabView.chatSessionIds
        : tabView?.chatSessionId
          ? [tabView.chatSessionId]
          : [];
    if (!activeSessionId) return null;
    const idx = ids.indexOf(activeSessionId);
    return idx >= 0 ? idx + 1 : null;
  }, [activeSessionId, tabView?.chatSessionId, tabView?.chatSessionIds]);
  const showSessionIndex = (tabView?.chatSessionIds?.length ?? 0) > 1;
  /** Resolve request leaf id from active branch leaf first, then fallback to latest user message. */
  const requestLeafMessageId = React.useMemo(() => {
    const activeLeafId =
      typeof activeLeafMessageId === "string" ? activeLeafMessageId.trim() : "";
    if (activeLeafId) return activeLeafId;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      const id = typeof message.id === "string" ? message.id.trim() : "";
      if (id) return id;
    }
    return undefined;
  }, [activeLeafMessageId, messages]);

  // 逻辑：仅在存在历史消息时显示 Preface 查看按钮。
  const showPrefaceButton = Boolean(basic.chatPrefaceEnabled) && messages.length > 0;

  // 新建会话按钮显示条件：有历史消息 + 启用多会话模式
  const shouldShowNewSessionButton = messages.length > 0 && (enableMultiSession ?? Boolean(quickLaunchProjectId));

  // 临时对话不显示历史按钮
  const shouldShowHistoryButton = enableMultiSession ?? Boolean(quickLaunchProjectId);

  const effectiveChatFeedbackOpen = chatFeedbackOpen && saasLoggedIn;

  const syncHistoryTitleToTabTitle = useMutation({
    ...(trpc.chatsession.updateManyChatSession.mutationOptions() as any),
    onSuccess: () => {
      // 中文注释：仅刷新会话列表，避免触发无关请求。
      invalidateChatSessions(queryClient);
    },
  });

  const handleMenuOpenChange = (open: boolean) => {
    menuLockRef.current = open;
    if (open) setHistoryOpen(true);
  };

  /** Close the left dock by removing the base panel. */
  const handleCloseDock = React.useCallback(() => {
    if (!tabId) return;
    useTabRuntime.getState().setTabBase(tabId, undefined);
  }, [tabId]);

  /** Handle quick launch item click: set left dock base for the current tab. */
  const handleQuickLaunch = React.useCallback(
    (item: (typeof QUICK_LAUNCH_ITEMS)[number] | (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]) => {
      if (!tabId) return;
      setQuickLaunchOpen(false);
      const tabState = useTabs.getState();
      const runtime = useTabRuntime.getState();

      if (quickLaunchProjectId && "value" in item) {
        const projItem = item as (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number];
        runtime.setTabBase(tabId, {
          id: `project:${quickLaunchProjectId}`,
          component: "plant-page",
          params: {
            projectId: quickLaunchProjectId,
            rootUri: quickLaunchProjectData?.project?.rootUri,
            projectTab: projItem.value,
          },
        });
        runtime.setTabLeftWidthPercent(tabId, 90);
        if (quickLaunchProjectData?.project?.title) {
          tabState.setTabTitle(tabId, quickLaunchProjectData.project.title);
        }
        if (quickLaunchProjectData?.project?.icon) {
          tabState.setTabIcon(tabId, quickLaunchProjectData.project.icon);
        }
      } else if ("baseId" in item) {
        const wsItem = item as (typeof QUICK_LAUNCH_ITEMS)[number];
        runtime.setTabBase(tabId, { id: wsItem.baseId, component: wsItem.component });
        runtime.setTabLeftWidthPercent(tabId, 100);
        tabState.setTabTitle(tabId, tAi(wsItem.titleKey));
        tabState.setTabIcon(tabId, wsItem.tabIcon);
      }
    },
    [tabId, quickLaunchProjectId, quickLaunchProjectData, tAi],
  );

  /**
   * Open the current session preface in a markdown stack panel.
   */
  const handleViewPreface = React.useCallback(async () => {
    if (!tabId) {
      toast.error("未找到当前标签页");
      return;
    }
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
      pushStackItem(tabId, {
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
  }, [activeSessionId, prefaceLoading, pushStackItem, requestLeafMessageId, tabId]);

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
      workspaceId: workspaceId || undefined,
      tabId: tabId || undefined,
      sessionId: activeSessionId || undefined,
      leafMessageId: requestLeafMessageId,
      projectId: quickLaunchProjectId || undefined,
      messageCount: messages.length,
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
    messages.length,
    quickLaunchProjectId,
    requestLeafMessageId,
    tabId,
  ]);

  /** Submit feedback payload to SaaS. */
  const submitChatFeedbackPayload = React.useCallback(async (input: {
    baseUrl: string;
    content: string;
    context: Record<string, unknown>;
  }) => {
    const client = new SaaSClient({
      baseUrl: input.baseUrl,
      getAccessToken: async () => (await getAccessToken()) ?? "",
    });
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

      const client = new SaaSClient({
        baseUrl,
        getAccessToken: async () => (await getAccessToken()) ?? "",
      });
      const attachment = await client.feedback.uploadAttachment(
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
      await submitChatFeedbackPayload({ baseUrl, content, context });

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
    <div
      className={cn(
        "grid w-full min-w-0 shrink-0 items-center p-1 pl-2",
        showDockButton
          ? "grid-cols-[auto_minmax(0,1fr)_auto]"
          : "grid-cols-[minmax(0,1fr)_auto]",
        className
      )}
    >
      {showDockButton && (
        <Popover
          open={!hasBase && quickLaunchOpen}
          onOpenChange={(open) => { if (!hasBase) setQuickLaunchOpen(open); }}
        >
          <PopoverTrigger asChild>
            <MessageAction
              aria-label={hasBase ? "关闭面板" : "打开面板"}
              className={cn("mr-0.5", resolveActionIconClass(hasBase ? "closeDock" : "openDock"))}
              tooltip={hasBase ? "关闭面板" : "打开面板"}
              label={hasBase ? "关闭面板" : "打开面板"}
              onClick={hasBase ? handleCloseDock : undefined}
            >
              <PanelLeft size={20} className={cn("transition-transform duration-200", hasBase && "rotate-180")} />
            </MessageAction>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-40 p-1"
          >
            {(quickLaunchProjectId
              ? PROJECT_QUICK_LAUNCH_ITEMS
              : QUICK_LAUNCH_ITEMS
            ).map((item) => {
              const Icon = item.icon;
              const label = quickLaunchProjectId
                ? tWorkspace((item as (typeof PROJECT_QUICK_LAUNCH_ITEMS)[number]).labelKey)
                : tAi((item as (typeof QUICK_LAUNCH_ITEMS)[number]).labelKey);
              return (
                <button
                  key={"value" in item ? item.value : (item as (typeof QUICK_LAUNCH_ITEMS)[number]).baseId}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60"
                  onClick={() => handleQuickLaunch(item)}
                >
                  <Icon className={cn("size-4 shrink-0", item.iconColor)} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
      <div className="flex min-w-0 w-full items-center pr-2">
        <span className="min-w-0 truncate text-left text-sm font-medium">
          {showSessionIndex && sessionIndex ? (
            <span className="mr-1 text-[11px] text-muted-foreground/70 tabular-nums">
              #{sessionIndex}
            </span>
          ) : null}
          {sessionTitle.length > 0 ? sessionTitle : null}
        </span>
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
        {saasLoggedIn && messages.length > 0 ? (
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
      </div>
      <MessageActions className="min-w-0 justify-end gap-0">
        {shouldShowNewSessionButton && (
          <MessageAction
            aria-label="重新开始会话"
            className={resolveActionIconClass("clear")}
            onClick={() => {
              setHistoryOpen(false);
              menuLockRef.current = false;
              newSession();
            }}
            tooltip="重新开始会话"
            label="重新开始会话"
          >
            <MessageSquarePlus size={20} />
          </MessageAction>
        )}
        {shouldShowHistoryButton && (
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <MessageAction
                aria-label="History"
                className={resolveActionIconClass("history")}
                onClick={() => {
                  // 中文注释：点击历史按钮立即刷新会话列表，确保拿到最新数据。
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
                onMenuOpenChange={handleMenuOpenChange}
                onSelect={(session) => {
                  // 选中历史会话后：关闭弹层 + 切换会话并加载历史
                  setHistoryOpen(false);
                  menuLockRef.current = false;
                  const hasTabBase = Boolean(tabView?.base);
                  const tabTitle = String(tabView?.title ?? "").trim();
                  const selectedSessionMeta = sessions.find((item) => item.id === session.id);
                  const isSelectedUserRename = Boolean(selectedSessionMeta?.isUserRename);
                  // 无左侧 base 的 tab：如果历史会话还没被用户重命名/仍是默认标题，则用当前 tab title 覆盖它
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
                  if (tabId && !hasTabBase) {
                    const nextTitle = session.name.trim();
                    if (nextTitle) setTabTitle(tabId, nextTitle);
                  }
                  // 历史会话可能属于不同项目，写入 chatSessionProjectIds 映射
                  if (tabId && selectedSessionMeta?.projectId) {
                    setSessionProjectId(tabId, session.id, selectedSessionMeta.projectId);
                  }
                  selectSession(session.id);
                }}
              />
            </PopoverContent>
          </Popover>
        )}
        {onCloseSession && (
          <MessageAction
            aria-label="关闭会话"
            className={resolveActionIconClass("close")}
            onClick={onCloseSession}
            tooltip="关闭会话"
            label="关闭会话"
          >
            <X size={20} />
          </MessageAction>
        )}
      </MessageActions>
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
    </div>
  );
}
