"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { BROWSER_WINDOW_PANEL_ID, useTabs } from "@/hooks/use-tabs";
import { upsertTabSnapshotNow } from "@/lib/tab-snapshot";
import { StackHeader } from "@/components/layout/StackHeader";
import { BrowserTabsBar } from "@/components/browser/BrowserTabsBar";
import { BrowserProgressBar } from "@/components/browser/BrowserProgressBar";
import { BrowserLoadingOverlay } from "@/components/browser/BrowserLoadingOverlay";
import { BrowserErrorOverlay } from "@/components/browser/BrowserErrorOverlay";
import { BrowserHome } from "@/components/browser/BrowserHome";
import { normalizeUrl } from "@/components/browser/browser-utils";
import type {
  BrowserTab,
  TeatimeWebContentsViewStatus,
} from "@/components/browser/browser-types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TriangleAlert } from "lucide-react";

type ElectrronBrowserWindowProps = {
  panelKey: string;
  tabId?: string;
  browserTabs?: BrowserTab[];
  activeBrowserTabId?: string;
  className?: string;
};

export default function ElectrronBrowserWindow({
  panelKey,
  tabId,
  browserTabs,
  activeBrowserTabId,
  className,
}: ElectrronBrowserWindowProps) {
  const tabActive = useTabActive();
  const safeTabId = typeof tabId === "string" ? tabId : undefined;
  const stackHidden = useTabs((s) => (safeTabId ? Boolean(s.stackHiddenByTabId[safeTabId]) : false));

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
    if (!stack.some((item) => item.id === panelKey)) return false;

    const activeStackId = s.activeStackItemIdByTabId[safeTabId] || stack.at(-1)?.id || "";
    return Boolean(activeStackId) && activeStackId !== panelKey;
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
  const showProgress = Boolean(targetUrl) && activeViewStatus?.ready !== true && !activeViewStatus?.failed;
  const showHome = !targetUrl;

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

      // 中文注释：loading overlay 和进度条都以 dom-ready 为准（更接近“可交互/可展示”的时机）。
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
    // 中文注释：没有拿到状态前，默认按 loading 处理，避免页面“还没 ready”就被展示出来。
    const nextLoading = cached ? cached.ready !== true : true;
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
            !stackHidden &&
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

    if (stackHidden) {
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
  }, [targetUrl, isElectron, activeViewKey, tabActive, coveredByAnotherStackItem, stackHidden]);

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

  const onOpenUrl = (url: string) => {
    if (!url || !activeId) return;
    const next = normalizeUrl(url);
    if (!next) return;
    // 中文注释：新标签页/首页中点击站点后，直接把 URL 写回当前激活标签，随后由 Electron view 管理逻辑接管加载。
    setEditingTabId(null);
    const nextTabs = tabsRef.current.map((t) => (t.id === activeId ? { ...t, url: next } : t));
    updateBrowserState(nextTabs, activeId);
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
    // 中文注释：关闭整个浏览器面板会同时关闭全部浏览器子标签（并销毁 Electron WebContentsView）。
    const ok = window.confirm("关闭浏览器将关闭全部标签页，确定继续？");
    if (!ok) return;

    const api = window.teatimeElectron;
    if (isElectron) {
      // 中文注释：先主动销毁所有 view，保证 Electron 页面同步关闭。
      for (const t of tabsRef.current) {
        if (t?.viewKey) {
          try {
            void api?.destroyWebContentsView?.(String(t.viewKey));
          } catch {
            // ignore
          }
        }
      }
      lastSentByKeyRef.current.clear();
    }

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
          <StackHeader
            title="Browser"
            onClose={onClosePanel}
            onRefresh={onRefreshPanel}
            showMinimize
            onMinimize={() => {
              if (!safeTabId) return;
              // 中文注释：最小化仅隐藏 stack，不销毁内部标签页。
              useTabs.getState().setStackHidden(safeTabId, true);
            }}
          >
            <BrowserTabsBar
              tabs={tabs}
              activeId={activeId}
              editingTabId={editingTabId}
              editingUrl={editingUrl}
              onSelect={onSelectBrowserTab}
              onClose={onCloseBrowserTab}
              onNew={onNewTab}
              onStartEditUrl={onStartEditUrl}
              onChangeEditingUrl={setEditingUrl}
              onCommitUrl={onCommitUrl}
              onCancelEdit={() => setEditingTabId(null)}
            />
          </StackHeader>

          <BrowserProgressBar visible={showProgress} />

          <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
            {showHome ? (
              <BrowserHome onOpenUrl={onOpenUrl} />
            ) : (
              <>
                <BrowserLoadingOverlay visible={loading} />
                <BrowserErrorOverlay failed={activeViewStatus?.failed} />
              </>
            )}
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
