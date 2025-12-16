"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import { useTabActive } from "@/components/layout/TabActiveContext";

type ElectrronBrowserWindowProps = {
  panelKey: string;
  url?: string;
  autoOpen?: boolean;
  className?: string;
};

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

export default function ElectrronBrowserWindow({
  panelKey,
  url,
  autoOpen,
  className,
}: ElectrronBrowserWindowProps) {
  const tabActive = useTabActive();
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );

  const initialUrl = useMemo(() => normalizeUrl(url ?? "https://www.baidu.com"), [url]);
  const [address, setAddress] = useState(initialUrl);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastSentRef = useRef<
    { url: string; bounds: TeatimeViewBounds; visible: boolean } | null
  >(null);

  const canOpen = Boolean(normalizeUrl(address));

  const open = useCallback(async () => {
    const target = normalizeUrl(address);
    if (!target) return;

    const api = window.teatimeElectron;
    if (!isElectron || !api?.upsertWebContentsView) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const bounds: TeatimeViewBounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    };

    await api.upsertWebContentsView({
      key: panelKey,
      url: target,
      bounds,
      visible: true,
    });
  }, [address, isElectron, panelKey]);

  useEffect(() => {
    if (!autoOpen) return;
    void open();
  }, [autoOpen, open]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.upsertWebContentsView) return;

    let rafId = 0;
    const sync = async (visible: boolean) => {
      const host = hostRef.current;
      if (!host) return;

      const target = normalizeUrl(address);
      if (!target) return;

      const rect = host.getBoundingClientRect();
      const next: { url: string; bounds: TeatimeViewBounds; visible: boolean } = {
        url: target,
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
  }, [address, isElectron, panelKey, tabActive]);

  useEffect(() => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.destroyWebContentsView) return;
    return () => {
      lastSentRef.current = null;
      void api.destroyWebContentsView?.(panelKey);
    };
  }, [isElectron, panelKey]);

  return (
    <div className={cn("flex h-full w-full flex-col gap-2 p-2", className)}>
      <div className="text-xs text-muted-foreground">
        Embed current URL via Electron `WebContentsView`.
      </div>

      <form
        className="flex min-w-0 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open();
        }}
      >
        <Input
          data-no-drag="true"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter URL (e.g. https://openai.com)"
          className="h-8"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          inputMode="url"
        />
        <Button
          data-no-drag="true"
          size="sm"
          variant="secondary"
          type="submit"
          className="h-8"
          disabled={!canOpen}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </form>

      {isElectron ? (
        <div
          ref={hostRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-background"
        />
      ) : (
        <iframe
          title="Browser"
          src={normalizeUrl(address)}
          className="min-h-0 flex-1 w-full rounded-md border"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />
      )}
    </div>
  );
}
