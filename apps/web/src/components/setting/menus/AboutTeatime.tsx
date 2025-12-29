"use client";

import { Button } from "@/components/ui/button";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { SettingsGroup } from "./SettingsGroup";
import { setSettingValue } from "@/hooks/use-settings";
import { WebSettingDefs } from "@/lib/setting-defs";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";

const STEP_UP_ROUTE = "/step-up";

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
  const [appVersion, setAppVersion] = React.useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<TeatimeAutoUpdateStatus | null>(
    null,
  );
  const [isRepairingFs, setIsRepairingFs] = React.useState(false);
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

  /** Fetch app version from Electron main process. */
  const fetchAppVersion = React.useCallback(async () => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.getAppVersion) return;
    try {
      const version = await api.getAppVersion();
      if (version) setAppVersion(version);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Fetch latest update status snapshot from Electron main process. */
  const fetchUpdateStatus = React.useCallback(async () => {
    const api = window.teatimeElectron;
    if (!isElectron || !api?.getAutoUpdateStatus) return;
    try {
      const status = await api.getAutoUpdateStatus();
      if (status) setUpdateStatus(status);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Trigger update check or install depending on current state. */
  const triggerUpdateAction = React.useCallback(async () => {
    const api = window.teatimeElectron;
    if (!isElectron || !api) return;
    // 已下载则直接重启安装，否则触发更新检查。
    if (updateStatus?.state === "downloaded") {
      await api.installUpdate?.();
      return;
    }
    await api.checkForUpdates?.();
  }, [isElectron, updateStatus?.state]);

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

  /** Clear all WebContentsViews via Electron IPC. */
  const clearWebContentsViews = React.useCallback(async () => {
    const api = window.teatimeElectron;
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
      const detail = (event as CustomEvent<TeatimeAutoUpdateStatus>).detail;
      if (!detail) return;
      setUpdateStatus(detail);
    };

    window.addEventListener("teatime:auto-update:status", onUpdateStatus);
    return () => window.removeEventListener("teatime:auto-update:status", onUpdateStatus);
  }, [isElectron]);

  /** Re-enter the setup flow by resetting step-up status. */
  const restartSetup = React.useCallback(async () => {
    // 流程：先重置初始化标记，再跳转到初始化页面；写入异常时也进入页面，避免卡在当前页。
    try {
      await setSettingValue(WebSettingDefs.StepUpInitialized, false);
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign(STEP_UP_ROUTE);
      }
    }
  }, []);

  const currentVersion = appVersion ?? updateStatus?.currentVersion ?? "—";
  const downloadPercent = updateStatus?.progress?.percent;
  const updateLabel = React.useMemo(() => {
    if (!isElectron) return "网页版不支持自动更新";
    if (!updateStatus) return "等待检测更新";
    const next = updateStatus.nextVersion ? `v${updateStatus.nextVersion}` : "新版本";
    switch (updateStatus.state) {
      case "checking":
        return "正在检查更新...";
      case "available":
        return `发现 ${next}，正在下载`;
      case "downloading":
        return `正在下载更新 ${Math.round(downloadPercent ?? 0)}%`;
      case "downloaded":
        return `${next} 已下载，等待重启`;
      case "not-available":
        return "当前已是最新版本";
      case "error":
        return updateStatus.error ? `更新失败：${updateStatus.error}` : "更新失败";
      case "idle":
      default:
        return "等待检测更新";
    }
  }, [isElectron, updateStatus, downloadPercent]);

  const updateActionLabel = updateStatus?.state === "downloaded" ? "立即重启" : "检测更新";
  const updateActionDisabled =
    !isElectron ||
    updateStatus?.state === "checking" ||
    updateStatus?.state === "available" ||
    updateStatus?.state === "downloading";

  const repairProjectIds = useMutation(trpc.project.repairIds.mutationOptions());

  /** Repair missing project id markers under workspace. */
  const repairFileSystem = React.useCallback(async () => {
    try {
      setIsRepairingFs(true);
      const res = await repairProjectIds.mutateAsync();
      // 中文注释：修复完成后提示创建的标记数量。
      toast.success(`修复完成：补齐 ${res.created} 个项目标记`);
    } catch (err: any) {
      toast.error(err?.message ?? "修复失败");
    } finally {
      setIsRepairingFs(false);
    }
  }, [repairProjectIds]);

  return (
    <div className="space-y-6">
      <SettingsGroup title="版本">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-medium">Teatime</div>
              <div className="text-xs text-muted-foreground">v{currentVersion}</div>
            </div>
            <div className="text-xs text-muted-foreground">{updateLabel}</div>
          </div>

          <div className="shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={updateActionDisabled}
              onClick={() => void triggerUpdateAction()}
            >
              {updateActionLabel}
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
                <div className="flex items-center justify-end gap-2">
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
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup title="操作">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">重新进入初始化</div>
            <div className="shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={() => void restartSetup()}>
                进入
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-3 py-3">
            <div className="text-sm font-medium">修复文件系统</div>
            <div className="shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRepairingFs}
                onClick={() => void repairFileSystem()}
              >
                {isRepairingFs ? "修复中..." : "执行"}
              </Button>
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
