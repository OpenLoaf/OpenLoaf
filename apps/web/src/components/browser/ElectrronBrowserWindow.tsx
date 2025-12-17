"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
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
  url?: string;
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
  url,
  className,
}: ElectrronBrowserWindowProps) {
  const tabActive = useTabActive();
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

  if (!isElectron) {
    return (
      <div className={cn("flex h-full w-full flex-col p-4", className)}>
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
    );
  }

  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastSentRef = useRef<{
    url: string;
    bounds: TeatimeViewBounds;
    visible: boolean;
  } | null>(null);

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
          visible,
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
            key: panelKey,
            url: next.url,
            bounds: next.bounds,
            visible,
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

    const tick = () => {
      void sync(true);
      rafId = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.cancelAnimationFrame(rafId);
      void sync(false);
    };
  }, [targetUrl, isElectron, panelKey, tabActive]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.destroyWebContentsView) return;
    return () => {
      lastSentRef.current = null;
      void api.destroyWebContentsView?.(panelKey);
    };
  }, [isElectron, panelKey]);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-background",
        className
      )}
    >
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
