"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowRight, RotateCcw } from "lucide-react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: any;
    }
  }
}

type ElectronBrowserProps = {
  panelKey: string;
  url?: string;
  className?: string;
};

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  // Allow explicit schemes.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;

  // Support localhost:xxxx style inputs.
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;

  return `https://${value}`;
}

export default function ElectronBrowser({ panelKey, url, className }: ElectronBrowserProps) {
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    []
  );

  const initialUrl = useMemo(() => normalizeUrl(url ?? "https://www.baidu.com"), [url]);
  const [address, setAddress] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const viewRef = useRef<any>(null);

  useEffect(() => {
    setAddress(initialUrl);
    setCurrentUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (!isElectron) return;
    const node = viewRef.current as HTMLElement | null;
    if (!node?.setAttribute) return;
    node.setAttribute("allowpopups", "");
  }, [isElectron, panelKey, currentUrl]);

  const canNavigate = Boolean(normalizeUrl(address));

  const navigate = () => {
    const next = normalizeUrl(address);
    if (!next) return;
    setCurrentUrl(next);
  };

  const reload = () => {
    try {
      if (isElectron && viewRef.current?.reload) {
        viewRef.current.reload();
        return;
      }
    } catch {
      // ignore
    }
    setCurrentUrl((u) => u);
  };

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 w-full flex-col", className)}>
      <div className="shrink-0 border-b bg-background/70 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-2 py-2">
          <Button
            data-no-drag="true"
            size="sm"
            variant="ghost"
            onClick={reload}
            aria-label="Reload"
            className="h-8 w-8 p-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              navigate();
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
              disabled={!canNavigate}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <div
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      >
        {isElectron ? (
          <webview
            ref={viewRef}
            key={`${panelKey}:${currentUrl}`}
            src={currentUrl}
            className="absolute inset-0 flex h-full w-full min-h-0 min-w-0"
            style={{ width: "100%", height: "100%" }}
            data-allow-context-menu="true"
          />
        ) : (
          <iframe
            key={`${panelKey}:${currentUrl}`}
            title="Browser"
            src={currentUrl}
            className="absolute inset-0 block h-full w-full min-h-0 min-w-0"
            style={{ width: "100%", height: "100%" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
          />
        )}
      </div>
    </div>
  );
}
