"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { BROWSER_WINDOW_PANEL_ID, useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { upsertTabSnapshotNow } from "@/lib/tab-snapshot";
import { StackHeader } from "@/components/layout/StackHeader";
import { BrowserTabsBar } from "@/components/browser/BrowserTabsBar";
import { BrowserProgressBar } from "@/components/browser/BrowserProgressBar";
import { BrowserLoadingOverlay } from "@/components/browser/BrowserLoadingOverlay";
import { BrowserErrorOverlay } from "@/components/browser/BrowserErrorOverlay";
import { BrowserHome } from "@/components/browser/BrowserHome";
import { Button } from "@/components/ui/button";
import { normalizeUrl } from "@/components/browser/browser-utils";
import {
  addFavoriteSite,
  addRecentlyClosedSite,
  getFavoriteSites,
  onBrowserStorageChange,
  removeFavoriteSite,
  setFavoriteIconByUrl,
} from "@/components/browser/browser-storage";
import type {
  BrowserTab,
  TeatimeWebContentsViewStatus,
  TeatimeWebContentsViewWindowOpen,
} from "@/components/browser/browser-types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Star, TriangleAlert } from "lucide-react";

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
  // 缺少 viewKey 时不使用 panelKey 作为占位，避免 status 事件匹配失败导致一直 loading。
  const activeViewKey = active?.viewKey ? String(active.viewKey) : "";
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
  const canGoBack = Boolean(activeViewStatus?.canGoBack);
  const canGoForward = Boolean(activeViewStatus?.canGoForward);
  const showNavigation = canGoBack || canGoForward;
  const canFavorite = Boolean(activeUrl);
  const [favoriteUrls, setFavoriteUrls] = useState<string[]>([]);
  const isFavorite = Boolean(activeUrl && favoriteUrls.includes(activeUrl));

  const ensuredTargetIdRef = useRef<Set<string>>(new Set());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const viewKeyPatchedRef = useRef(false);

  useEffect(() => {
    // Sync favorites from local cache for star state.
    const syncFavorites = () => {
      setFavoriteUrls(getFavoriteSites().map((item) => item.url));
    };
    syncFavorites();
    return onBrowserStorageChange(syncFavorites);
  }, []);

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

  // Sync tab title from WebContents status events.
  const syncTabTitleFromStatus = (status: TeatimeWebContentsViewStatus) => {
    if (!safeTabId) return;
    const nextTitle = status.title?.trim();
    if (!nextTitle) return;
    const currentTabs = tabsRef.current;
    const target = currentTabs.find((t) => t.viewKey === status.key);
    if (!target || target.title === nextTitle) return;
    // 收到标题后立即同步到标签页状态，保证标题展示正确。
    const nextTabs = currentTabs.map((t) =>
      t.viewKey === status.key ? { ...t, title: nextTitle } : t,
    );
    updateBrowserState(nextTabs, activeId);
  };

  // Sync favorite icon when a page reports its favicon.
  const syncFavoriteIconFromStatus = (status: TeatimeWebContentsViewStatus) => {
    if (!status.url || !status.faviconUrl) return;
    // 只有页面真实打开后才会触发 favicon 更新，避免未打开时写入。
    setFavoriteIconByUrl(status.url, status.faviconUrl);
  };

  const guessTitleFromUrl = (url: string) => {
    try {
      return new URL(url).hostname || "New Tab";
    } catch {
      return "New Tab";
    }
  };

  const updateBrowserState = (nextTabs: ElectrronBrowserWindowProps["browserTabs"], nextActiveId?: string) => {
    if (!safeTabId) return;
    // 立即更新运行时引用，避免并发事件把已关闭的标签重新写回。
    const normalizedTabs = Array.isArray(nextTabs) ? nextTabs : [];
    tabsRef.current = normalizedTabs;
    // 浏览器面板内的状态（tabs/active）统一写回到 tab.stack，作为单一事实来源。
    useTabs.getState().setBrowserTabs(safeTabId, normalizedTabs, nextActiveId);
  };

  useEffect(() => {
    if (!safeTabId || viewKeyPatchedRef.current) return;
    const missing = tabs.some((t) => !t.viewKey && t.id);
    if (!missing) return;

    // 补齐历史遗留的 viewKey，避免关闭时无法定位对应的 WebContentsView。
    const nextTabs = tabs.map((t) =>
      t.viewKey || !t.id ? t : { ...t, viewKey: buildViewKey(t.id) },
    );
    viewKeyPatchedRef.current = true;
    updateBrowserState(nextTabs, activeId);
  }, [tabs, safeTabId, activeId]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !safeTabId) return;
    const ensureWebContentsView = api?.ensureWebContentsView;
    if (!ensureWebContentsView) return;
    if (!targetUrl) return;

    const viewAlive = tabsRef.current.some((t) => t.viewKey === activeViewKey);
    if (!viewAlive) return;

    const key = activeViewKey;
    let canceled = false;

    (async () => {
      const res = await ensureWebContentsView({ key, url: targetUrl });
      if (canceled || !res?.ok) return;
      if (!res.cdpTargetId) return;
      if (ensuredTargetIdRef.current.has(res.cdpTargetId)) return;
      ensuredTargetIdRef.current.add(res.cdpTargetId);

      // 把 cdpTargetIds 写回当前激活的浏览器子标签，并立即上报快照给 server。
      const nextTabs = tabsRef.current.map((t) =>
        t.viewKey === key
          ? {
              ...t,
              // 仅保留有效的字符串 id，去重
              cdpTargetIds: Array.from(
                new Set(
                  [...(t.cdpTargetIds ?? []), res.cdpTargetId].filter(
                    (id): id is string => typeof id === "string" && id.length > 0,
                  ),
                ),
              ),
            }
          : t,
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

      syncTabTitleFromStatus(detail);
      syncFavoriteIconFromStatus(detail);

      if (detail.key !== activeViewKey) return;

      setActiveViewStatus(detail.destroyed ? null : detail);

      // loading overlay 和进度条都以 dom-ready 为准（更接近“可交互/可展示”的时机）。
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
  }, [isElectron, activeViewKey, targetUrl, activeId, safeTabId]);

  useEffect(() => {
    if (!isElectron || !safeTabId) return;

  const handleWindowOpen = (event: Event) => {
    const detail = (event as CustomEvent<TeatimeWebContentsViewWindowOpen>).detail;
    if (!detail?.key || !detail?.url) return;
    console.log("[browser-tabs] window-open", detail);
    const nextUrl = normalizeUrl(detail.url);
    if (!nextUrl) return;

      const currentTabs = tabsRef.current;
      const fromTab = currentTabs.find((t) => t.viewKey === detail.key);
      if (!fromTab) return;

      // 拦截到新窗口时，转为浏览器标签页创建，避免弹出独立窗口。
      const id = createBrowserTabId();
      const viewKey = buildViewKey(id);
      const nextTabs = [
        ...currentTabs,
        { id, viewKey, url: nextUrl, title: guessTitleFromUrl(nextUrl) },
      ];
      const openInBackground = detail.disposition === "background-tab";
      updateBrowserState(nextTabs, openInBackground ? activeId : id);
    };

    window.addEventListener("teatime:webcontents-view:window-open", handleWindowOpen);
    return () =>
      window.removeEventListener("teatime:webcontents-view:window-open", handleWindowOpen);
  }, [isElectron, safeTabId, activeId]);

  useEffect(() => {
    // 切换浏览器子标签时，立即使用已缓存的状态刷新 loading/ready，避免“切换后一直 loading”。
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
    // 没有拿到状态前，默认按 loading 处理，避免页面“还没 ready”就被展示出来。
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
      const viewAlive = tabsRef.current.some((t) => t.viewKey === activeViewKey);
      if (!viewAlive) return;

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
      // 关闭整个浏览器面板时，销毁所有子标签对应的 WebContentsView，避免泄漏。
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
    const fallbackKey = closing?.id ? buildViewKey(closing.id) : "";
    const targetViewKey =
      closing?.viewKey || (closing?.id === activeId ? activeViewKey : fallbackKey);
    const nextTabs = current.filter((t) => t.id !== id);
    const nextActive =
      activeId === id ? (nextTabs.at(-1)?.id ?? nextTabs[0]?.id ?? "") : activeId;
    updateBrowserState(nextTabs, nextActive);
    if (closing?.url) {
      // 关闭标签时把页面记录进最近关闭列表，方便快速恢复。
      addRecentlyClosedSite({ url: closing.url, title: closing.title });
    }
    if (targetViewKey && isElectron) {
      console.log("[browser-tabs] close", { id, targetViewKey, hasViewKey: Boolean(closing?.viewKey) });
      lastSentByKeyRef.current.delete(targetViewKey);
      viewStatusByKeyRef.current.delete(targetViewKey);
      if (activeViewKey === targetViewKey) {
        setActiveViewStatus(null);
        setLoading(false);
      }
      try {
        void api?.destroyWebContentsView?.(String(targetViewKey));
      } catch {
        // ignore
      }
    }
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
    // 新标签页/首页中点击站点后，直接把 URL 写回当前激活标签，随后由 Electron view 管理逻辑接管加载。
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
    // 多标签时才需要提示，单标签直接关闭。
    const shouldConfirm = tabsRef.current.length > 1;
    if (shouldConfirm) {
      // 关闭整个浏览器面板会同时关闭全部浏览器子标签（并销毁 Electron WebContentsView）。
      const ok = window.confirm("关闭浏览器将关闭全部标签页，确定继续？");
      if (!ok) return;
    }

    const api = window.teatimeElectron;
    if (isElectron) {
      // 先主动销毁所有 view，保证 Electron 页面同步关闭。
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

  // Add the current page to favorites.
  const onAddFavorite = () => {
    if (!activeUrl) {
      return;
    }
    if (isFavorite) {
      removeFavoriteSite(activeUrl);
      return;
    }
    addFavoriteSite({
      url: activeUrl,
      title: active?.title,
      iconUrl: activeViewStatus?.faviconUrl,
    });
  };

  // Navigate back within the active WebContentsView.
  const onGoBack = () => {
    if (!isElectron || !activeViewKey) return;
    const api = window.teatimeElectron;
    if (!api?.goBackWebContentsView) return;
    void api.goBackWebContentsView(activeViewKey);
  };

  // Navigate forward within the active WebContentsView.
  const onGoForward = () => {
    if (!isElectron || !activeViewKey) return;
    const api = window.teatimeElectron;
    if (!api?.goForwardWebContentsView) return;
    void api.goForwardWebContentsView(activeViewKey);
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
            rightSlot={
              !showHome ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAddFavorite}
                disabled={!canFavorite}
                aria-label="Favorite"
                aria-pressed={isFavorite}
                title={isFavorite ? "已收藏" : "收藏"}
              >
                <Star
                  className={cn("h-4 w-4", isFavorite ? "text-foreground" : "")}
                  fill={isFavorite ? "currentColor" : "none"}
                />
              </Button>
              ) : null
            }
            onClose={onClosePanel}
            onRefresh={onRefreshPanel}
            showMinimize
            onMinimize={() => {
              if (!safeTabId) return;
              // 最小化仅隐藏 stack，不销毁内部标签页。
              requestStackMinimize(safeTabId);
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <motion.div
                className="flex shrink-0 items-center gap-1"
                style={{ overflow: "hidden", pointerEvents: showNavigation ? "auto" : "none" }}
                initial={false}
                animate={{
                  opacity: showNavigation ? 1 : 0,
                  width: showNavigation ? 68 : 0,
                  x: showNavigation ? 0 : -6,
                }}
                transition={{
                  duration: 0.18,
                  ease: "easeOut",
                  delay: showNavigation ? 0.18 : 0,
                }}
              >
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  onClick={onGoBack}
                  disabled={!canGoBack}
                  aria-label="Back"
                  title="后退"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  onClick={onGoForward}
                  disabled={!canGoForward}
                  aria-label="Forward"
                  title="前进"
                >
                  {">"}
                </button>
              </motion.div>
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
            </div>
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
