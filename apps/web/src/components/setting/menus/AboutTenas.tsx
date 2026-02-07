"use client";

import { Button } from "@tenas-ai/ui/button";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { isElectronEnv } from "@/utils/is-electron-env";

const STEP_UP_ROUTE = "/step-up";

const ITEMS: Array<{ key: string; label: string }> = [
  { key: "license", label: "用户协议" },
  { key: "privacy", label: "隐私条款" },
  { key: "oss", label: "开源软件申明" },
  { key: "docs", label: "帮助文档" },
  { key: "contact", label: "联系我们" },
  { key: "issues", label: "报告问题" },
];

export function AboutTenas() {
  const { setBasic } = useBasicConfig();
  const clientId = getWebClientId();
  const [copiedKey, setCopiedKey] = React.useState<"clientId" | null>(null);
  const [webContentsViewCount, setWebContentsViewCount] = React.useState<number | null>(null);
  const [appVersion, setAppVersion] = React.useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<TenasIncrementalUpdateStatus | null>(
    null,
  );
  const isElectron = React.useMemo(() => isElectronEnv(), []);

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

  /** Fetch app version from Electron main process. */
  const fetchAppVersion = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.getAppVersion) return;
    try {
      const version = await api.getAppVersion();
      if (version) setAppVersion(version);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Fetch latest incremental update status snapshot from Electron main process. */
  const fetchUpdateStatus = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.getIncrementalUpdateStatus) return;
    try {
      const status = await api.getIncrementalUpdateStatus();
      if (status) setUpdateStatus(status);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Trigger incremental update check. */
  const triggerUpdateAction = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api) return;
    await api.checkIncrementalUpdate?.();
  }, [isElectron]);

  /** Fetch WebContentsView count from Electron main process via IPC. */
  const fetchWebContentsViewCount = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.getWebContentsViewCount) return;
    try {
      const res = await api.getWebContentsViewCount();
      if (res?.ok) setWebContentsViewCount(res.count);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Clear all WebContentsViews via Electron IPC. */
  const clearWebContentsViews = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.clearWebContentsViews) return;
    try {
      const res = await api.clearWebContentsViews();
      if (res?.ok) setWebContentsViewCount(0);
      // 清除后再刷新一次，避免计数残留。
      await fetchWebContentsViewCount();
    } catch {
      // ignore
    }
  }, [isElectron, fetchWebContentsViewCount]);

  React.useEffect(() => {
    if (!isElectron) return;

    // 设置页打开时拉取一次，并在窗口重新聚焦/重新可见时刷新，避免数值长期陈旧。
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

  React.useEffect(() => {
    if (!isElectron) return;
    void fetchAppVersion();
    void fetchUpdateStatus();
  }, [isElectron, fetchAppVersion, fetchUpdateStatus]);

  React.useEffect(() => {
    if (!isElectron) return;

    const onUpdateStatus = (event: Event) => {
      const detail = (event as CustomEvent<TenasIncrementalUpdateStatus>).detail;
      if (!detail) return;
      setUpdateStatus(detail);
    };

    window.addEventListener("tenas:incremental-update:status", onUpdateStatus);
    return () =>
      window.removeEventListener("tenas:incremental-update:status", onUpdateStatus);
  }, [isElectron]);

  /** Reload the current page. */
  const reloadPage = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  /** Re-enter the setup flow by resetting step-up status. */
  const restartSetup = React.useCallback(async () => {
    // 流程：先重置初始化标记，再跳转到初始化页面；写入异常时也进入页面，避免卡在当前页。
    try {
      await setBasic({ stepUpInitialized: false });
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign(STEP_UP_ROUTE);
      }
    }
  }, []);

  const currentVersion = appVersion ?? "—";
  const downloadPercent = updateStatus?.progress?.percent;
  const updateLabel = React.useMemo(() => {
    if (!isElectron) return "网页版不支持增量更新";
    if (!updateStatus) return "等待检测更新";
    const componentLabel =
      updateStatus.progress?.component === "server" ? "服务端" : "Web";
    // 兼容 idle 状态下仍有错误提示的情况（例如 Electron 版本过低）。
    if (updateStatus.state === "idle" && updateStatus.error) {
      return `更新失败：${updateStatus.error}`;
    }
    switch (updateStatus.state) {
      case "checking":
        return "正在检查更新...";
      case "downloading":
        return updateStatus.progress
          ? `正在下载${componentLabel}更新 ${Math.round(downloadPercent ?? 0)}%`
          : "正在下载更新...";
      case "ready":
        return "更新已准备好，重启后生效";
      case "error":
        return updateStatus.error ? `更新失败：${updateStatus.error}` : "更新失败";
      case "idle":
      default:
        return updateStatus.lastCheckedAt ? "当前已是最新版本" : "等待检测更新";
    }
  }, [isElectron, updateStatus, downloadPercent]);

  const updateActionLabel =
    updateStatus?.state === "ready" ? "更新已就绪" : "检测更新";
  const updateActionDisabled =
    !isElectron ||
    updateStatus?.state === "checking" ||
    updateStatus?.state === "downloading" ||
    updateStatus?.state === "ready";
  const serverVersion = updateStatus?.server?.version ?? "—";
  const webVersion = updateStatus?.web?.version ?? "—";

  return (
    <div className="space-y-6">
      <TenasSettingsGroup title="版本">
        <div className="space-y-3 py-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <div className="text-sm font-medium">Tenas</div>
                <div className="text-xs text-muted-foreground">v{currentVersion}</div>
              </div>
              <div className="text-xs text-muted-foreground">{updateLabel}</div>
            </div>

            <TenasSettingsField>
              <Button
                variant="outline"
                size="sm"
                disabled={updateActionDisabled}
                onClick={() => void triggerUpdateAction()}
              >
                {updateActionLabel}
              </Button>
            </TenasSettingsField>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div>桌面端：v{currentVersion}</div>
            <div>服务端：v{serverVersion}</div>
            <div>Web：v{webVersion}</div>
          </div>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="状态">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">客户端ID</div>
            <TenasSettingsField className="max-w-[70%]">
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
            </TenasSettingsField>
          </div>
          {isElectron ? (
            <div className="flex flex-wrap items-start gap-3 px-3 py-3">
              <div className="text-sm font-medium">WebContentsView数</div>
              <TenasSettingsField className="max-w-[70%] gap-2">
                <button
                  type="button"
                  aria-label="点击刷新 WebContentsView 数"
                  title="点击刷新"
                  className={[
                    "text-right",
                    "bg-transparent p-0",
                    "text-xs truncate",
                    "text-muted-foreground hover:text-foreground hover:underline cursor-pointer",
                  ].join(" ")}
                  onClick={() => void fetchWebContentsViewCount()}
                >
                  {webContentsViewCount == null ? "—" : String(webContentsViewCount)}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  aria-label="清除 WebContentsView"
                  disabled={webContentsViewCount == null || webContentsViewCount === 0}
                  onClick={() => void clearWebContentsViews()}
                >
                  清除
                </Button>
              </TenasSettingsField>
            </div>
          ) : null}
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="操作">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">页面重新加载</div>
              <div className="text-xs text-muted-foreground">刷新整个页面</div>
            </div>
            <TenasSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={reloadPage}>
                刷新
              </Button>
            </TenasSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">重新进入初始化</div>
            <TenasSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={() => void restartSetup()}>
                进入
              </Button>
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="信息">
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
      </TenasSettingsGroup>
    </div>
  );
}
