"use client";

import { Button } from "@/components/ui/button";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
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
  const appId = typeof window !== "undefined" ? window.teatimeElectron?.appId : undefined;
  const [copiedKey, setCopiedKey] = React.useState<"appId" | "clientId" | null>(null);

  const appStatusQuery = useQuery({
    ...trpc.runtime.getAppStatus.queryOptions({ appId: appId ?? "" }),
    enabled: Boolean(appId),
    // 中文备注：轮询放在 SettingsPage（父组件）里；这里读取缓存即可。
    staleTime: 1000,
    meta: { silent: true },
  });

  /** 中文备注：复制到剪贴板（navigator.clipboard 不可用时做降级）。 */
  const copyToClipboard = async (text: string, key: "appId" | "clientId") => {
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
            <div className="text-sm font-medium">应用程序ID</div>
            <div className="min-w-0 max-w-[70%]">
              <button
                type="button"
                aria-label="点击复制应用程序ID"
                disabled={!appId}
                title={appId || undefined}
                className={[
                  "w-full text-right",
                  "bg-transparent p-0",
                  "text-xs truncate",
                  appId
                    ? "text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                    : "text-muted-foreground cursor-default",
                  copiedKey === "appId" ? "text-foreground" : "",
                ].join(" ")}
                onClick={() => void copyToClipboard(appId ?? "", "appId")}
              >
                {copiedKey === "appId" ? "已复制" : appId || "—"}
              </button>
            </div>
          </div>
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
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">应用程序状态</div>
            <div className="text-xs text-muted-foreground">
              {!appId ? (
                "—"
              ) : appStatusQuery.data?.connected ? (
                "已连接"
              ) : (
                /**
                 * 中文备注：未连接/检测中都只显示转圈，避免给用户造成“断开”的负反馈。
                 */
                <Loader2
                  className="inline-block h-4 w-4 animate-spin text-muted-foreground"
                  aria-label="连接中"
                />
              )}
            </div>
          </div>
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
