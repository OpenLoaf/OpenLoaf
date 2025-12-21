"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useTabs } from "@/hooks/use-tabs";
import { upsertTabSnapshotNow } from "@/lib/tab-snapshot";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TriangleAlert } from "lucide-react";
import { Loader } from "@/components/animate-ui/icons/loader";

type ElectrronBrowserWindowProps = {
  panelKey: string;
  tabId?: string;
  url?: string;
  pageTargetId?: string;
  viewKey?: string;
  className?: string;
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
  url,
  viewKey,
  className,
}: ElectrronBrowserWindowProps) {
  const tabActive = useTabActive();
  const coveredByAnotherStackItem = useTabs((s) => {
    if (!tabId) return false;
    if (s.activeTabId !== tabId) return false;
    const tab = s.tabs.find((t) => t.id === tabId);
    const stack = tab?.stack ?? [];
    const index = stack.findIndex((item) => item.id === panelKey);
    if (index === -1) return false;
    return index !== stack.length - 1;
  });
  const [loading, setLoading] = useState(true);
  const [overlayBlocked, setOverlayBlocked] = useState(false);
  const loadingTokenRef = useRef(0);
  const loadingSinceRef = useRef(0);
  const overlayBlockedRef = useRef(false);
  const coveredByAnotherStackItemRef = useRef(false);
  const overlayIdsRef = useRef<Set<string>>(new Set());
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" &&
        navigator.userAgent.includes("Electron")),
    []
  );

  const targetUrl = useMemo(
    () => normalizeUrl(url ?? "https://www.baidu.com"),
    [url]
  );

  const ensuredTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !tabId) return;
    const ensureWebContentsView = api?.ensureWebContentsView;
    if (!ensureWebContentsView) return;
    if (!targetUrl) return;

    const key = String(viewKey ?? panelKey);
    let canceled = false;

    (async () => {
      const res = await ensureWebContentsView({ key, url: targetUrl });
      if (canceled || !res?.ok) return;
      if (!res.cdpTargetId) return;
      if (ensuredTargetIdRef.current === res.cdpTargetId) return;
      ensuredTargetIdRef.current = res.cdpTargetId;

      // 中文注释：把 cdpTargetId 写回 tab 的 stack item（单一事实来源：TabSnapshot）。
      const state = useTabs.getState();
      const tab = state.getTabById(tabId);
      const item = tab?.stack?.find((x) => x.id === panelKey);
      if (item) {
        state.pushStackItem(tabId, {
          ...item,
          params: { ...(item.params ?? {}), cdpTargetId: res.cdpTargetId, viewKey: key, url: targetUrl },
          sourceKey: item.sourceKey ?? key,
        } as any);
      }

      // 中文注释：cdpTargetId 已就绪，立即上报一次快照，确保 server 能马上 attach 控制。
      const sessionId = tab?.chatSessionId;
      if (sessionId) {
        try {
          await upsertTabSnapshotNow({ sessionId, tabId });
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isElectron, tabId, panelKey, viewKey, targetUrl]);

  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const tabActiveRef = useRef(tabActive);
  useEffect(() => {
    tabActiveRef.current = tabActive;
  }, [tabActive]);

  coveredByAnotherStackItemRef.current = coveredByAnotherStackItem;

  useEffect(() => {
    loadingTokenRef.current += 1;
    loadingSinceRef.current = performance.now();
    setLoading(true);
  }, [targetUrl]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastSentRef = useRef<{
    url: string;
    bounds: TeatimeViewBounds;
    visible: boolean;
  } | null>(null);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron) return;

    const hideIfNeeded = () => {
      const prev = lastSentRef.current;
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
          key: panelKey,
          url: prev.url,
          bounds: prev.bounds,
          visible: false,
        });
        lastSentRef.current = { ...prev, visible: false };
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
        const prev = lastSentRef.current;
        if (api?.upsertWebContentsView && tabActiveRef.current && prev) {
          void api.upsertWebContentsView({
            key: panelKey,
            url: prev.url,
            bounds: prev.bounds,
            visible: false,
          });
          lastSentRef.current = { ...prev, visible: false };
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
  }, [isElectron, panelKey]);

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

      const prev = lastSentRef.current;
      const changed =
        !prev ||
        prev.url !== next.url ||
        prev.visible !== next.visible ||
        prev.bounds.x !== next.bounds.x ||
        prev.bounds.y !== next.bounds.y ||
        prev.bounds.width !== next.bounds.width ||
        prev.bounds.height !== next.bounds.height;

      if (changed) {
        lastSentRef.current = next;
        try {
          await api.upsertWebContentsView({
            key: String(viewKey ?? panelKey),
            url: next.url,
            bounds: next.bounds,
            visible: next.visible,
          });
          if (loadingRef.current) {
            const token = loadingTokenRef.current;
            const minLoadingMs = 500;
            const elapsed = performance.now() - loadingSinceRef.current;
            const remaining = Math.max(0, minLoadingMs - elapsed);

            window.setTimeout(() => {
              if (token !== loadingTokenRef.current) return;
              loadingRef.current = false;
              setLoading(false);
            }, remaining);
          }
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
  }, [targetUrl, isElectron, panelKey, tabActive, coveredByAnotherStackItem]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.destroyWebContentsView) return;
    return () => {
      lastSentRef.current = null;
      void api.destroyWebContentsView?.(String(viewKey ?? panelKey));
    };
  }, [isElectron, panelKey, viewKey]);

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
      ) : (
        <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader size={18} />
                <span>Loading…</span>
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
      )}
    </div>
  );
}
