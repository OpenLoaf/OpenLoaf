"use client";

import { Button } from "@/components/ui/button";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { SettingsGroup } from "./SettingsGroup";

const ITEMS: Array<{ key: string; label: string }> = [
  { key: "license", label: "用户协议" },
  { key: "privacy", label: "隐私条款" },
  { key: "oss", label: "开源软件申明" },
  { key: "docs", label: "帮助文档" },
  { key: "contact", label: "联系我们" },
  { key: "issues", label: "报告问题" },
];

export function AboutTeatime() {
  const clientId = getWebClientId();
  const [copiedKey, setCopiedKey] = React.useState<"clientId" | null>(null);
  const [webContentsViewCount, setWebContentsViewCount] = React.useState<number | null>(null);
  const isElectron = React.useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    [],
  );

  /** 复制到剪贴板（navigator.clipboard 不可用时做降级）。 */
  const copyToClipboard = async (text: string, key: "clientId") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }

    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 800);
  };

  /** Fetch WebContentsView count from Electron main process via IPC. */
  const fetchWebContentsViewCount = React.useCallback(async () => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.getWebContentsViewCount) return;
    try {
      const res = await api.getWebContentsViewCount();
      if (res?.ok) setWebContentsViewCount(res.count);
    } catch {
      // ignore
    }
  }, [isElectron]);

  React.useEffect(() => {
    if (!isElectron) return;

    // 中文注释：设置页打开时拉取一次，并在窗口重新聚焦/重新可见时刷新，避免数值长期陈旧。
    void fetchWebContentsViewCount();

    const onFocus = () => void fetchWebContentsViewCount();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onFocus();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isElectron, fetchWebContentsViewCount]);

  return (
    <div className="space-y-6">
      <SettingsGroup title="版本">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-medium">Teatime</div>
              <div className="text-xs text-muted-foreground">v0.1.0</div>
            </div>
            <div className="text-xs text-muted-foreground">当前已是最新版本</div>
          </div>

          <div className="shrink-0">
            <Button variant="outline" size="sm">
              检测更新
            </Button>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="状态">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">客户端ID</div>
            <div className="min-w-0 max-w-[70%]">
              <button
                type="button"
                aria-label="点击复制客户端ID"
                disabled={!clientId}
                title={clientId || undefined}
                className={[
                  "w-full text-right",
                  "bg-transparent p-0",
                  "text-xs truncate",
                  clientId
                    ? "text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                    : "text-muted-foreground cursor-default",
                  copiedKey === "clientId" ? "text-foreground" : "",
                ].join(" ")}
                onClick={() => void copyToClipboard(clientId, "clientId")}
              >
                {copiedKey === "clientId" ? "已复制" : clientId || "—"}
              </button>
            </div>
          </div>
          {isElectron ? (
            <div className="flex items-center justify-between gap-4 px-3 py-3">
              <div className="text-sm font-medium">WebContentsView数</div>
              <div className="min-w-0 max-w-[70%]">
                <button
                  type="button"
                  aria-label="点击刷新 WebContentsView 数"
                  title="点击刷新"
                  className={[
                    "w-full text-right",
                    "bg-transparent p-0",
                    "text-xs truncate",
                    "text-muted-foreground hover:text-foreground hover:underline cursor-pointer",
                  ].join(" ")}
                  onClick={() => void fetchWebContentsViewCount()}
                >
                  {webContentsViewCount == null ? "—" : String(webContentsViewCount)}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup title="信息">
        <div className="divide-y divide-border">
          {ITEMS.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              className="w-full justify-between px-3 py-3 h-auto rounded-none"
            >
              <span className="text-sm font-medium">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
}
