"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { BROWSER_WINDOW_PANEL_ID, useTabs } from "@/hooks/use-tabs";
import { upsertTabSnapshotNow } from "@/lib/tab-snapshot";
import { StackHeader } from "@/components/layout/StackHeader";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Loader } from "@/components/animate-ui/icons/loader";

type ElectrronBrowserWindowProps = {
  panelKey: string;
  tabId?: string;
  browserTabs?: Array<{ id: string; url: string; title?: string; viewKey: string; cdpTargetId?: string }>;
  activeBrowserTabId?: string;
  className?: string;
};

type TeatimeWebContentsViewStatus = {
  key: string;
  webContentsId: number;
  url?: string;
  title?: string;
  loading?: boolean;
  ready?: boolean;
  failed?: { errorCode: number; errorDescription: string; validatedURL: string };
  destroyed?: boolean;
  ts: number;
};

function normalizeUrl(raw: string): string {
  const value = raw?.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

export default function ElectrronBrowserWindow({
  panelKey,
  tabId,
  browserTabs,
  activeBrowserTabId,
  className,
}: ElectrronBrowserWindowProps) {
  const tabActive = useTabActive();
  const safeTabId = typeof tabId === "string" ? tabId : undefined;

  const tabs = Array.isArray(browserTabs) ? browserTabs : [];
  const activeId = activeBrowserTabId ?? tabs[0]?.id ?? "";
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;
  const activeUrl = normalizeUrl(active?.url ?? "");
  const activeViewKey = String(active?.viewKey ?? panelKey);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState("");

  const coveredByAnotherStackItem = useTabs((s) => {
    if (!safeTabId) return false;
    if (s.activeTabId !== safeTabId) return false;
    const tab = s.tabs.find((t) => t.id === safeTabId);
    const stack = tab?.stack ?? [];
    const index = stack.findIndex((item) => item.id === panelKey);
    if (index === -1) return false;
    return index !== stack.length - 1;
  });
  const [loading, setLoading] = useState(true);
  const [overlayBlocked, setOverlayBlocked] = useState(false);
  const overlayBlockedRef = useRef(false);
  const coveredByAnotherStackItemRef = useRef(false);
  const overlayIdsRef = useRef<Set<string>>(new Set());
  const viewStatusByKeyRef = useRef<Map<string, TeatimeWebContentsViewStatus>>(new Map());
  const [activeViewStatus, setActiveViewStatus] = useState<TeatimeWebContentsViewStatus | null>(null);
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" &&
        navigator.userAgent.includes("Electron")),
    []
  );

  const targetUrl = useMemo(() => activeUrl, [activeUrl]);

  const ensuredTargetIdRef = useRef<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const createBrowserTabId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const buildViewKey = (browserTabId: string) => {
    if (!safeTabId) return `${BROWSER_WINDOW_PANEL_ID}:${browserTabId}`;
    const tab = useTabs.getState().getTabById(safeTabId);
    const workspaceId = tab?.workspaceId ?? "unknown";
    const chatSessionId = tab?.chatSessionId ?? "unknown";
    return `browser:${workspaceId}:${safeTabId}:${chatSessionId}:${browserTabId}`;
  };

  const updateBrowserState = (nextTabs: ElectrronBrowserWindowProps["browserTabs"], nextActiveId?: string) => {
    if (!safeTabId) return;
    // 中文注释：浏览器面板内的状态（tabs/active）统一写回到 tab.stack，作为单一事实来源。
    useTabs.getState().pushStackItem(
      safeTabId,
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: "electron-browser-window",
        params: { __customHeader: true, browserTabs: nextTabs ?? [], activeBrowserTabId: nextActiveId },
      } as any,
      100,
    );
  };

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !safeTabId) return;
    const ensureWebContentsView = api?.ensureWebContentsView;
    if (!ensureWebContentsView) return;
    if (!targetUrl) return;

    const key = activeViewKey;
    let canceled = false;

    (async () => {
      const res = await ensureWebContentsView({ key, url: targetUrl });
      if (canceled || !res?.ok) return;
      if (!res.cdpTargetId) return;
      if (ensuredTargetIdRef.current === res.cdpTargetId) return;
      ensuredTargetIdRef.current = res.cdpTargetId;

      // 中文注释：把 cdpTargetId 写回当前激活的浏览器子标签，并立即上报快照给 server。
      const nextTabs = tabsRef.current.map((t) =>
        t.viewKey === key ? { ...t, cdpTargetId: res.cdpTargetId } : t,
      );
      updateBrowserState(nextTabs, activeId);

      const sessionId = useTabs.getState().getTabById(safeTabId)?.chatSessionId;
      if (sessionId) void upsertTabSnapshotNow({ sessionId, tabId: safeTabId });
    })();

    return () => {
      canceled = true;
    };
  }, [isElectron, safeTabId, targetUrl, activeViewKey, activeId]);

  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (!isElectron) return;

    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<TeatimeWebContentsViewStatus>).detail;
      if (!detail?.key) return;

      if (detail.destroyed) {
        viewStatusByKeyRef.current.delete(detail.key);
      } else {
        viewStatusByKeyRef.current.set(detail.key, detail);
      }

      if (detail.key !== activeViewKey) return;

      setActiveViewStatus(detail.destroyed ? null : detail);

      // 中文注释：以 dom-ready 作为“可展示”的 ready 信号，loading UI 不再用定时器猜测。
      if (!targetUrl) {
        loadingRef.current = false;
        setLoading(false);
        return;
      }
      if (detail.failed) {
        loadingRef.current = false;
        setLoading(false);
        return;
      }
      const nextLoading = detail.ready !== true;
      loadingRef.current = nextLoading;
      setLoading(nextLoading);
    };

    window.addEventListener("teatime:webcontents-view:status", handleStatus);
    return () => window.removeEventListener("teatime:webcontents-view:status", handleStatus);
  }, [isElectron, activeViewKey, targetUrl]);

  useEffect(() => {
    // 中文注释：切换浏览器子标签时，立即使用已缓存的状态刷新 loading/ready，避免“切换后一直 loading”。
    const cached = viewStatusByKeyRef.current.get(activeViewKey) ?? null;
    setActiveViewStatus(cached);

    if (!targetUrl) {
      loadingRef.current = false;
      setLoading(false);
      return;
    }
    if (cached?.failed) {
      loadingRef.current = false;
      setLoading(false);
      return;
    }
    const nextLoading = cached?.ready !== true;
    loadingRef.current = nextLoading;
    setLoading(nextLoading);
  }, [activeViewKey, targetUrl]);

  const tabActiveRef = useRef(tabActive);
  useEffect(() => {
    tabActiveRef.current = tabActive;
  }, [tabActive]);

  coveredByAnotherStackItemRef.current = coveredByAnotherStackItem;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastSentByKeyRef = useRef<
    Map<string, { url: string; bounds: TeatimeViewBounds; visible: boolean }>
  >(new Map());

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron) return;

    const hideIfNeeded = () => {
      const prev = lastSentByKeyRef.current.get(activeViewKey) ?? null;
      if (
        !api?.upsertWebContentsView ||
        !tabActiveRef.current ||
        !prev ||
        !prev.visible
      ) {
        return;
      }

      if (coveredByAnotherStackItemRef.current) {
        void api.upsertWebContentsView({
          key: activeViewKey,
          url: prev.url,
          bounds: prev.bounds,
          visible: false,
        });
        lastSentByKeyRef.current.set(activeViewKey, { ...prev, visible: false });
      }
    };

    const handleOverlay = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; open: boolean }>)
        .detail;
      if (!detail?.id) return;

      if (detail.open) {
        overlayIdsRef.current.add(detail.id);
        overlayBlockedRef.current = overlayIdsRef.current.size > 0;
        setOverlayBlocked(overlayBlockedRef.current);
        const prev = lastSentByKeyRef.current.get(activeViewKey) ?? null;
        if (api?.upsertWebContentsView && tabActiveRef.current && prev) {
          void api.upsertWebContentsView({
            key: activeViewKey,
            url: prev.url,
            bounds: prev.bounds,
            visible: false,
          });
          lastSentByKeyRef.current.set(activeViewKey, { ...prev, visible: false });
        }
      } else {
        overlayIdsRef.current.delete(detail.id);
        overlayBlockedRef.current = overlayIdsRef.current.size > 0;
        setOverlayBlocked(overlayBlockedRef.current);
        hideIfNeeded();
      }
    };

    hideIfNeeded();
    window.addEventListener("teatime:overlay", handleOverlay);
    return () => window.removeEventListener("teatime:overlay", handleOverlay);
  }, [isElectron, activeViewKey]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.upsertWebContentsView) return;

    let rafId = 0;
    const sync = async (visible: boolean) => {
      const host = hostRef.current;
      if (!host) return;

      if (!targetUrl) return;

      const rect = host.getBoundingClientRect();
      const next: { url: string; bounds: TeatimeViewBounds; visible: boolean } =
        {
          url: targetUrl,
          visible:
            visible &&
            !loadingRef.current &&
            !overlayBlockedRef.current &&
            !coveredByAnotherStackItemRef.current,
          bounds: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
          },
        };

      const prev = lastSentByKeyRef.current.get(activeViewKey) ?? null;
      const changed =
        !prev ||
        prev.url !== next.url ||
        prev.visible !== next.visible ||
        prev.bounds.x !== next.bounds.x ||
        prev.bounds.y !== next.bounds.y ||
        prev.bounds.width !== next.bounds.width ||
        prev.bounds.height !== next.bounds.height;

      if (changed) {
        lastSentByKeyRef.current.set(activeViewKey, next);
        try {
          await api.upsertWebContentsView({
            key: activeViewKey,
            url: next.url,
            bounds: next.bounds,
            visible: next.visible,
          });
        } catch {
          // ignore
        }
      }
    };

    if (!tabActive) {
      window.cancelAnimationFrame(rafId);
      void sync(false);
      return;
    }

    if (coveredByAnotherStackItem) {
      window.cancelAnimationFrame(rafId);
      void sync(false);
      return;
    }

    const tick = () => {
      void sync(true);
      rafId = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(rafId);
      void sync(false);
    };
  }, [targetUrl, isElectron, activeViewKey, tabActive, coveredByAnotherStackItem]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.destroyWebContentsView) return;
    return () => {
      // 中文注释：关闭整个浏览器面板时，销毁所有子标签对应的 WebContentsView，避免泄漏。
      for (const t of tabsRef.current) {
        if (t?.viewKey) void api.destroyWebContentsView?.(String(t.viewKey));
      }
      lastSentByKeyRef.current.clear();
    };
  }, [isElectron]);

  // ======
  // 内部“Safari tabs”交互：切换/关闭
  // ======

  const onSelectBrowserTab = (id: string) => {
    if (!id) return;
    setEditingTabId(null);
    updateBrowserState(tabsRef.current, id);
  };

  const onCloseBrowserTab = (id: string) => {
    if (!id) return;
    if (editingTabId === id) setEditingTabId(null);
    const api = window.teatimeElectron;
    const current = tabsRef.current;
    const closing = current.find((t) => t.id === id);
    if (closing?.viewKey && isElectron) {
      try {
        void api?.destroyWebContentsView?.(String(closing.viewKey));
      } catch {
        // ignore
      }
    }

    const nextTabs = current.filter((t) => t.id !== id);
    const nextActive =
      activeId === id ? (nextTabs.at(-1)?.id ?? nextTabs[0]?.id) : activeId;
    updateBrowserState(nextTabs, nextActive);
  };

  const onStartEditUrl = () => {
    if (!activeId) return;
    setEditingTabId(activeId);
    setEditingUrl(activeUrl);
  };

  const onCommitUrl = () => {
    if (!editingTabId) return;
    const next = normalizeUrl(editingUrl);
    setEditingTabId(null);
    if (!next) return;
    const nextTabs = tabsRef.current.map((t) => (t.id === editingTabId ? { ...t, url: next } : t));
    updateBrowserState(nextTabs, editingTabId);
  };

  const onNewTab = () => {
    if (!safeTabId) return;
    const id = createBrowserTabId();
    const viewKey = buildViewKey(id);
    const nextTabs = [...tabsRef.current, { id, viewKey, url: "", title: "New Tab" }];
    setEditingTabId(id);
    setEditingUrl("");
    updateBrowserState(nextTabs, id);
  };

  const onClosePanel = () => {
    if (!safeTabId) return;
    // 中文注释：关闭整个浏览器面板（stack item），并由 useEffect cleanup 负责销毁所有 view。
    useTabs.getState().removeStackItem(safeTabId, panelKey);
  };

  const onRefreshPanel = () => {
    if (!safeTabId) return;
    const state = useTabs.getState();
    const tab = state.getTabById(safeTabId);
    const item = tab?.stack?.find((x) => x.id === panelKey);
    if (!item) return;
    const current = Number((item.params as any)?.__refreshKey ?? 0);
    state.pushStackItem(
      safeTabId,
      { ...item, params: { ...(item.params ?? {}), __refreshKey: current + 1 } } as any,
      100,
    );
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-background",
        className
      )}
    >
      {!isElectron ? (
        <div className="flex h-full w-full flex-col p-4">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert />
              </EmptyMedia>
              <EmptyTitle>仅支持 Electron</EmptyTitle>
              <EmptyDescription>
                这个面板依赖桌面端的 Electron 能力（WebContentsView）。请在 Electron
                客户端打开，或直接访问：
                {targetUrl ? (
                  <>
                    {" "}
                    <a href={targetUrl} target="_blank" rel="noreferrer">
                      {targetUrl}
                    </a>
                  </>
                ) : null}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : !safeTabId ? (
        <div className="flex h-full w-full flex-col p-4">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert />
              </EmptyMedia>
              <EmptyTitle>缺少 Tab</EmptyTitle>
              <EmptyDescription>无法定位当前 TabId。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <StackHeader title="Browser" onClose={onClosePanel} onRefresh={onRefreshPanel}>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide">
              {tabs.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-1">暂无页面</div>
              ) : (
                tabs.map((t) => {
                  const isActive = t.id === activeId;
                  const isEditing = isActive && editingTabId === t.id;
                  const title = t.title ?? "Untitled";
                  const url = normalizeUrl(t.url ?? "");
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "group flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm",
                        isActive
                          ? "bg-sidebar-accent text-foreground min-w-[320px]"
                          : "bg-transparent text-muted-foreground hover:bg-sidebar/60 hover:text-foreground max-w-[180px]",
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectBrowserTab(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectBrowserTab(t.id);
                        }
                      }}
                      title={title}
                    >
                      {isActive ? (
                        isEditing ? (
                          <input
                            autoFocus
                            value={editingUrl}
                            onChange={(e) => setEditingUrl(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                onCommitUrl();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingTabId(null);
                              }
                            }}
                            onBlur={() => onCommitUrl()}
                            placeholder="输入网址，回车跳转"
                            className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-xs text-foreground outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground hover:underline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onStartEditUrl();
                            }}
                            title={url}
                          >
                            {url || "点击输入网址"}
                          </button>
                        )
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{title}</span>
                      )}
                      <button
                        type="button"
                        className="grid h-6 w-6 place-items-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onCloseBrowserTab(t.id);
                        }}
                        aria-label="Close"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
              <button
                type="button"
                className="ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-transparent text-muted-foreground hover:bg-sidebar/60 hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNewTab();
                }}
                aria-label="New tab"
                title="新建标签"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </StackHeader>

          <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence>
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-10 grid place-items-center bg-background/70"
                >
                  <motion.div
                    initial={{ scale: 0.98, opacity: 0.85 }}
                    animate={{ scale: [0.98, 1, 0.98], opacity: [0.85, 1, 0.85] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Loader size={18} />
                    <span>Loading…</span>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {activeViewStatus?.failed ? (
              <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
                <div className="max-w-[360px] rounded-lg border bg-background p-4 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <TriangleAlert className="h-4 w-4" />
                    <span>页面加载失败</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {activeViewStatus.failed.errorDescription || "Load failed"}
                  </div>
                  {activeViewStatus.failed.validatedURL ? (
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {activeViewStatus.failed.validatedURL}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {overlayBlocked || coveredByAnotherStackItem ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-background/80">
                <div className="text-center text-sm text-muted-foreground">
                  <div>内容已临时隐藏</div>
                  <div className="mt-1 text-xs">
                    {overlayBlocked
                      ? "关闭右键菜单或搜索后恢复显示"
                      : "切回顶部窗口后恢复显示"}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
