"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { StackHeader } from "@/components/layout/StackHeader";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { TerminalTabsBar } from "@/components/file/TerminalTabsBar";
import { TERMINAL_WINDOW_PANEL_ID, type TerminalTab } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { resolveServerUrl } from "@/utils/server-url";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { createTerminalTabId } from "@/hooks/tab-id";

import "xterm/css/xterm.css";
import "./terminal-viewer.css";

interface TerminalViewerProps {
  pwdUri?: string;
  terminalTabs?: TerminalTab[];
  activeTerminalTabId?: string;
  panelKey?: string;
  tabId?: string;
}

type TerminalSession = {
  sessionId: string;
  token: string;
};

type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code?: number; signal?: number };

type TerminalShortcutAction =
  | { type: "new" }
  | { type: "select"; index: number };

/** Build a websocket URL for terminal sessions. */
function resolveTerminalWsUrl(sessionId: string, token: string): string {
  const baseUrl = resolveServerUrl();
  const origin =
    baseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const wsBase = origin.replace(/^http/, "ws");
  const params = new URLSearchParams({ sessionId, token });
  return `${wsBase}/terminal/ws?${params.toString()}`;
}

/** Parse terminal server message payload. */
function parseTerminalMessage(raw: string): TerminalServerMessage | null {
  try {
    return JSON.parse(raw) as TerminalServerMessage;
  } catch {
    return null;
  }
}

/** Extract pwd uri from a terminal tab. */
function getTerminalTabPwdUri(tab: TerminalTab): string {
  const params = tab.params as { pwdUri?: string } | undefined;
  const fromParams = typeof params?.pwdUri === "string" ? params.pwdUri : "";
  const direct = typeof tab.pwdUri === "string" ? tab.pwdUri : "";
  return fromParams || direct;
}

/** Resolve Alt/Option shortcut intent for terminal tabs. */
function resolveTerminalAltShortcut(event: KeyboardEvent): TerminalShortcutAction | null {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null;
  const code = event.code || "";
  const key = event.key.toLowerCase();
  if (code === "KeyN" || key === "n") return { type: "new" };
  const digitMatch = /^(Digit|Numpad)([0-9])$/.exec(code);
  if (!digitMatch) return null;
  const digit = Number(digitMatch[2]);
  if (Number.isNaN(digit)) return null;
  if (digit === 0) return { type: "new" };
  return { type: "select", index: digit - 1 };
}

/** Build a display title for a terminal tab. */
function getTerminalTabTitle(tab: TerminalTab): string {
  if (typeof tab.title === "string" && tab.title.trim()) return tab.title.trim();
  const pwdUri = getTerminalTabPwdUri(tab);
  if (!pwdUri) return "Terminal";
  try {
    const url = new URL(pwdUri);
    const parts = url.pathname.split("/").filter(Boolean);
    // 中文注释：只取目录名，不展示完整路径。
    return decodeURIComponent(parts.at(-1) ?? "Root") || "Root";
  } catch {
    const parts = pwdUri.split("/").filter(Boolean);
    return parts.at(-1) ?? "Terminal";
  }
}

/** Render a single terminal session view. */
function TerminalSessionView({
  tab,
  active,
  enabled,
  allowShortcut,
  onRequestNewTab,
  onRequestSelectTab,
}: {
  tab: TerminalTab;
  active: boolean;
  enabled: boolean;
  /** Whether keyboard shortcuts are allowed for this session view. */
  allowShortcut: boolean;
  /** Request handler for creating a new terminal tab. */
  onRequestNewTab?: () => void;
  /** Request handler for selecting a terminal tab by index. */
  onRequestSelectTab?: (index: number) => void;
}) {
  const pwdUri = getTerminalTabPwdUri(tab);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const activeRef = useRef(active);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const allowShortcutRef = useRef(allowShortcut);
  const requestNewTabRef = useRef(onRequestNewTab);
  const requestSelectTabRef = useRef(onRequestSelectTab);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createSessionMutation = useMutation(
    trpc.terminal.createSession.mutationOptions()
  );
  const closeSessionMutation = useMutation(
    trpc.terminal.closeSession.mutationOptions()
  );

  useEffect(() => {
    activeRef.current = active;
    if (active) resizeHandlerRef.current?.();
  }, [active]);

  useEffect(() => {
    allowShortcutRef.current = allowShortcut;
  }, [allowShortcut]);

  useEffect(() => {
    requestNewTabRef.current = onRequestNewTab;
  }, [onRequestNewTab]);

  useEffect(() => {
    requestSelectTabRef.current = onRequestSelectTab;
  }, [onRequestSelectTab]);

  useEffect(() => {
    if (!enabled) return;
    if (!pwdUri || !containerRef.current) {
      setStatus("idle");
      return;
    }
    let disposed = false;
    setStatus("connecting");
    setErrorMessage(null);

    const terminal = new Terminal({
      convertEol: true,
      fontFamily:
        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace)",
      fontSize: 12,
      // 中文注释：macOS 下把 Option 视为 Meta，避免死键吞掉 Alt 快捷键。
      macOptionIsMeta: true,
      theme: {
        background: "transparent",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    const xtermRoot = containerRef.current.querySelector(".xterm");
    xtermRoot?.classList.add("p-1");
    const xtermViewport = containerRef.current.querySelector(".xterm-viewport");
    xtermViewport?.classList.add("rounded-sm");
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const sendMessage = (payload: object) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(payload));
    };

    const handleResize = () => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      fitAddonRef.current.fit();
      if (!activeRef.current) return;
      // 中文注释：仅在激活时同步 cols/rows，避免隐藏态写入错误尺寸。
      sendMessage({
        type: "resize",
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    };

    resizeHandlerRef.current = handleResize;

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(containerRef.current);

    const inputDisposable = terminal.onData((data) => {
      // 中文注释：用户输入透传给服务端 PTY。
      sendMessage({ type: "input", data });
    });
    terminal.attachCustomKeyEventHandler((domEvent) => {
      if (!allowShortcutRef.current) return true;
      const action = resolveTerminalAltShortcut(domEvent);
      if (!action) return true;
      // 中文注释：终端输入时捕获 Alt/Option 快捷键，转为终端标签操作。
      domEvent.preventDefault();
      domEvent.stopPropagation();
      if (action.type === "new") {
        requestNewTabRef.current?.();
      } else {
        requestSelectTabRef.current?.(action.index);
      }
      return false;
    });

    const connect = async () => {
      try {
        const session = await createSessionMutation.mutateAsync({
          pwd: pwdUri,
          cols: terminal.cols || 80,
          rows: terminal.rows || 24,
        });
        if (disposed) return;
        sessionRef.current = session;
        const socket = new WebSocket(
          resolveTerminalWsUrl(session.sessionId, session.token)
        );
        socketRef.current = socket;

        socket.onopen = () => {
          setStatus("ready");
          handleResize();
        };

        socket.onmessage = (event) => {
          const payload = parseTerminalMessage(String(event.data));
          if (!payload) return;
          if (payload.type === "output" && typeof payload.data === "string") {
            terminal.write(payload.data);
          } else if (payload.type === "exit") {
            setStatus("error");
            setErrorMessage("终端已退出");
          }
        };

        socket.onerror = () => {
          setStatus("error");
          setErrorMessage("终端连接失败");
        };
        socket.onclose = () => {
          if (disposed) return;
          setStatus((prev) => (prev === "ready" ? "error" : prev));
        };
      } catch (error) {
        if (disposed) return;
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "终端连接失败"
        );
      }
    };

    void connect();

    return () => {
      disposed = true;
      inputDisposable.dispose();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      resizeHandlerRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      if (sessionRef.current) {
        void closeSessionMutation.mutateAsync({
          sessionId: sessionRef.current.sessionId,
          token: sessionRef.current.token,
        });
        sessionRef.current = null;
      }
    };
  }, [pwdUri, enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-0 flex h-full w-full flex-col",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="terminal-viewer flex-1" ref={containerRef} />
      {status === "connecting" ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          正在连接终端…
        </div>
      ) : status === "error" ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {errorMessage ?? "终端连接失败"}
        </div>
      ) : null}
    </div>
  );
}

/** Render a terminal viewer powered by xterm.js. */
export default function TerminalViewer({
  pwdUri,
  terminalTabs,
  activeTerminalTabId,
  panelKey,
  tabId,
}: TerminalViewerProps) {
  const terminalStatus = useTerminalStatus();
  const { workspace } = useWorkspace();
  const tabActive = useTabActive();
  const safeTabId = typeof tabId === "string" ? tabId : undefined;
  const resolvedPanelKey = panelKey ?? TERMINAL_WINDOW_PANEL_ID;
  const stackHidden = useTabs((s) =>
    safeTabId ? Boolean(s.stackHiddenByTabId[safeTabId]) : false,
  );
  const coveredByAnotherStackItem = useTabs((s) => {
    if (!safeTabId) return false;
    if (s.activeTabId !== safeTabId) return false;
    const tab = s.tabs.find((t) => t.id === safeTabId);
    const stack = tab?.stack ?? [];
    if (!stack.some((item) => item.id === resolvedPanelKey)) return false;
    const activeStackId =
      s.activeStackItemIdByTabId[safeTabId] || stack.at(-1)?.id || "";
    return Boolean(activeStackId) && activeStackId !== resolvedPanelKey;
  });
  const enabled = terminalStatus.enabled && !terminalStatus.isLoading;

  const normalizedTabs = useMemo(() => {
    const rawTabs = Array.isArray(terminalTabs) ? terminalTabs : [];
    if (rawTabs.length > 0) return rawTabs;
    if (typeof pwdUri !== "string" || !pwdUri.trim()) return [];
    return [
      {
        id: `terminal:${pwdUri}`,
        component: "terminal",
        params: { pwdUri },
        pwdUri,
      },
    ] as TerminalTab[];
  }, [terminalTabs, pwdUri]);

  const activeId = activeTerminalTabId ?? normalizedTabs[0]?.id ?? "";
  const activeTab =
    normalizedTabs.find((t) => t.id === activeId) ?? normalizedTabs[0] ?? null;

  const tabsRef = useRef(normalizedTabs);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    tabsRef.current = normalizedTabs;
    activeIdRef.current = activeId;
  }, [normalizedTabs, activeId]);

  useEffect(() => {
    if (!safeTabId) return;
    if (Array.isArray(terminalTabs)) return;
    if (!pwdUri) return;
    // 中文注释：迁移旧的 pwdUri 参数到 terminalTabs 结构。
    useTabs.getState().setTerminalTabs(safeTabId, normalizedTabs, activeId);
  }, [safeTabId, terminalTabs, pwdUri, normalizedTabs, activeId]);

  /** Sync terminal tabs state into the tab store. */
  const updateTerminalState = useCallback(
    (nextTabs: TerminalTab[], nextActiveId?: string) => {
      if (!safeTabId) return;
      useTabs.getState().setTerminalTabs(safeTabId, nextTabs, nextActiveId);
    },
    [safeTabId],
  );

  /** Switch active terminal tab. */
  const onSelectTerminalTab = (id: string) => {
    if (!id) return;
    updateTerminalState(tabsRef.current, id);
  };

  /** Close a terminal tab and keep the panel alive. */
  const onCloseTerminalTab = (id: string) => {
    if (!id) return;
    const currentTabs = tabsRef.current;
    const nextTabs = currentTabs.filter((t) => t.id !== id);
    const currentActive = activeIdRef.current;
    const nextActive =
      currentActive === id
        ? nextTabs.at(-1)?.id ?? nextTabs[0]?.id ?? ""
        : currentActive;
    updateTerminalState(nextTabs, nextActive);
  };

  /** Create a new terminal tab using the best available pwd. */
  const onNewTerminalTab = useCallback(() => {
    if (!safeTabId) return;
    if (!enabled) {
      toast.error("终端功能未开启");
      return;
    }
    const activePwd = activeTab ? getTerminalTabPwdUri(activeTab) : "";
    const fallbackPwd = activePwd || workspace?.rootUri || "";
    if (!fallbackPwd) {
      toast.error("未找到工作区目录");
      return;
    }
    // 中文注释：默认沿用当前标签的 pwd，不存在则回退到 workspace 根目录。
    const nextTab: TerminalTab = {
      id: createTerminalTabId(),
      title: getTerminalTabTitle({ id: "temp", params: { pwdUri: fallbackPwd } }),
      component: "terminal",
      params: { pwdUri: fallbackPwd },
    };
    updateTerminalState([...tabsRef.current, nextTab], nextTab.id);
  }, [activeTab, enabled, safeTabId, updateTerminalState, workspace?.rootUri]);

  /** Select terminal tab by numeric index (1-based shortcut). */
  const selectTerminalTabByIndex = useCallback(
    (index: number) => {
      const currentTabs = tabsRef.current;
      const target = currentTabs[index];
      if (!target) return;
      updateTerminalState(currentTabs, target.id);
    },
    [updateTerminalState],
  );

  /** Handle Alt/Option shortcut for creating a new terminal tab. */
  const handleTerminalTabShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (!tabActive) return;
      if (stackHidden || coveredByAnotherStackItem) return;
      if (event.repeat) return;
      const action = resolveTerminalAltShortcut(event);
      if (!action) return;
      // 中文注释：Alt/Option 快捷键仅在终端面板处于前台时生效，阻止输入死键符号。
      event.preventDefault();
      event.stopPropagation();
      if (action.type === "new") {
        onNewTerminalTab();
      } else {
        selectTerminalTabByIndex(action.index);
      }
    },
    [
      coveredByAnotherStackItem,
      onNewTerminalTab,
      selectTerminalTabByIndex,
      stackHidden,
      tabActive,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleTerminalTabShortcut, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleTerminalTabShortcut, { capture: true });
    };
  }, [handleTerminalTabShortcut]);

  /** Close the terminal panel with confirmation. */
  const onClosePanel = () => {
    if (!safeTabId) return;
    const ok = window.confirm("关闭终端面板将关闭所有标签，确定继续？");
    if (!ok) return;
    useTabs.getState().removeStackItem(safeTabId, resolvedPanelKey);
  };

  /** Force remount the terminal panel by bumping refresh key. */
  const onRefreshPanel = () => {
    if (!safeTabId) return;
    const state = useTabs.getState();
    const tab = state.getTabById(safeTabId);
    const item = tab?.stack?.find((x) => x.id === resolvedPanelKey);
    if (!item) return;
    const current = Number((item.params as any)?.__refreshKey ?? 0);
    state.pushStackItem(
      safeTabId,
      { ...item, params: { ...(item.params ?? {}), __refreshKey: current + 1 } } as any,
      100,
    );
  };

  if (!safeTabId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        缺少 TabId
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <StackHeader
        title="Terminal"
        onClose={onClosePanel}
        onRefresh={onRefreshPanel}
        showMinimize
        onMinimize={() => {
          // 中文注释：最小化只隐藏 stack，不销毁终端会话。
          requestStackMinimize(safeTabId);
        }}
      >
        <TerminalTabsBar
          tabs={normalizedTabs}
          activeId={activeId}
          onSelect={onSelectTerminalTab}
          onClose={onCloseTerminalTab}
          onNew={onNewTerminalTab}
          getTitle={getTerminalTabTitle}
          disableNew={!enabled}
        />
      </StackHeader>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {terminalStatus.isLoading ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            正在检查终端状态…
          </div>
        ) : !terminalStatus.enabled ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            终端功能未开启
          </div>
        ) : normalizedTabs.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            未选择目录
          </div>
        ) : (
          normalizedTabs.map((tab) => {
            const component =
              typeof tab.component === "string" && tab.component.trim()
                ? tab.component
                : "terminal";

            if (component !== "terminal") {
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "absolute inset-0 flex h-full w-full items-center justify-center text-sm text-muted-foreground",
                    tab.id === activeId
                      ? "opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  暂不支持的终端标签
                </div>
              );
            }

            return (
              <TerminalSessionView
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                enabled={enabled}
                allowShortcut={
                  enabled && tabActive && !stackHidden && !coveredByAnotherStackItem
                }
                onRequestNewTab={onNewTerminalTab}
                onRequestSelectTab={selectTerminalTabByIndex}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
