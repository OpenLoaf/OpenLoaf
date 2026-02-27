/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { Button } from "@openloaf/ui/button";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { ChevronRight, Download, FileText, Loader2 } from "lucide-react";
import * as React from "react";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { isElectronEnv } from "@/utils/is-electron-env";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@openloaf/ui/sheet";
import { Streamdown } from "streamdown";

const STEP_UP_ROUTE = "/step-up";
const UPDATE_BASE_URL = process.env.NEXT_PUBLIC_UPDATE_BASE_URL;

/**
 * Build changelog URL for a given component and version.
 */
function buildChangelogUrl(component: "server" | "web", version: string): string | undefined {
  if (!UPDATE_BASE_URL || version === "—" || version === "bundled") return undefined;
  return `${UPDATE_BASE_URL}/changelogs/${component}/${version}`;
}

const ITEMS: Array<{ key: string; label: string }> = [
  { key: "license", label: "用户协议" },
  { key: "privacy", label: "隐私条款" },
  { key: "oss", label: "开源软件申明" },
  { key: "docs", label: "帮助文档" },
  { key: "contact", label: "联系我们" },
  { key: "issues", label: "报告问题" },
];

/**
 * Strip YAML frontmatter (--- ... ---) from a markdown string.
 */
function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) return raw.slice(match[0].length).trim();
  return raw.trim();
}

/**
 * Extract primary language code from a locale string (e.g. 'zh-CN' → 'zh').
 */
function primaryLang(locale: string): string {
  const primary = locale.split("-")[0].toLowerCase();
  return primary || "zh";
}

/**
 * Fetch a single changelog with language fallback (fallback to English).
 */
async function fetchChangelogWithLang(baseUrl: string, lang: string): Promise<string | null> {
  const candidates =
    lang === "en" ? [`${baseUrl}/en.md`] : [`${baseUrl}/${lang}.md`, `${baseUrl}/en.md`];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.text();
      const body = stripFrontmatter(raw);
      if (body) return body;
    } catch {
      // ignore
    }
  }
  return null;
}

export function AboutOpenLoaf() {
  const { basic, setBasic } = useBasicConfig();
  const clientId = getWebClientId();
  const [copiedKey, setCopiedKey] = React.useState<"clientId" | null>(null);
  const [webContentsViewCount, setWebContentsViewCount] = React.useState<number | null>(null);
  const [appVersion, setAppVersion] = React.useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<OpenLoafIncrementalUpdateStatus | null>(
    null,
  );
  const [changelogSheet, setChangelogSheet] = React.useState<{
    open: boolean;
    component: "server" | "web" | null;
    version: string | null;
    content: string | null;
    loading: boolean;
  }>({
    open: false,
    component: null,
    version: null,
    content: null,
    loading: false,
  });
  const isElectron = React.useMemo(() => isElectronEnv(), []);
  // 开发模式下禁用更新功能（pnpm desktop）。
  const isDevDesktop = isElectron && process.env.NODE_ENV !== "production";

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
    const api = window.openloafElectron;
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
    const api = window.openloafElectron;
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
    const api = window.openloafElectron;
    // 开发模式禁用更新检查，避免触发无效请求。
    if (!isElectron || isDevDesktop || !api) return;
    await api.checkIncrementalUpdate?.();
  }, [isElectron, isDevDesktop]);

  /** Fetch WebContentsView count from Electron main process via IPC. */
  const fetchWebContentsViewCount = React.useCallback(async () => {
    const api = window.openloafElectron;
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
    const api = window.openloafElectron;
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

  /** Open changelog sheet and fetch content. */
  const openChangelog = React.useCallback(async (component: "server" | "web", version: string) => {
    setChangelogSheet({
      open: true,
      component,
      version,
      content: null,
      loading: true,
    });

    const changelogUrl = buildChangelogUrl(component, version);
    if (changelogUrl) {
      const lang = primaryLang(basic.uiLanguage);
      const content = await fetchChangelogWithLang(changelogUrl, lang);
      setChangelogSheet((prev) => ({
        ...prev,
        content: content || "无法加载更新日志",
        loading: false,
      }));
    } else {
      setChangelogSheet((prev) => ({
        ...prev,
        content: "当前版本暂无更新日志",
        loading: false,
      }));
    }
  }, []);

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
      const detail = (event as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail;
      if (!detail) return;
      setUpdateStatus(detail);
    };

    window.addEventListener("openloaf:incremental-update:status", onUpdateStatus);
    return () =>
      window.removeEventListener("openloaf:incremental-update:status", onUpdateStatus);
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
  }, [setBasic]);

  const currentVersion = appVersion ?? "—";
  const downloadPercent = updateStatus?.progress?.percent;
  const updateLabel = React.useMemo(() => {
    if (!isElectron) return "网页版不支持增量更新";
    if (isDevDesktop) return "开发模式已关闭更新检测";
    if (!updateStatus) return "等待检测更新";
    const componentLabel =
      updateStatus.progress?.component === "server" ? "服务端" : "Web";
    // 兼容 idle 状态下仍有错误提示的情况（例如 Electron 版本过低）。
    if (updateStatus.state === "idle" && updateStatus.error) {
      return `更新检查失败：${updateStatus.error}`;
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
        return updateStatus.error
          ? `更新检查失败：${updateStatus.error}`
          : "更新检查失败，请稍后重试";
      case "idle":
      default:
        return updateStatus.lastCheckedAt ? "当前已是最新版本" : "等待检测更新";
    }
  }, [isElectron, isDevDesktop, updateStatus, downloadPercent]);

  const updateActionLabel = isDevDesktop
    ? "开发模式不可用"
    : updateStatus?.state === "ready"
      ? "更新已就绪"
      : "检测更新";
  const updateActionDisabled =
    !isElectron ||
    isDevDesktop ||
    updateStatus?.state === "checking" ||
    updateStatus?.state === "downloading" ||
    updateStatus?.state === "ready";
  const serverVersion = updateStatus?.server?.version ?? "—";
  const webVersion = updateStatus?.web?.version ?? "—";

  const hasNewUpdate = updateStatus?.state === "ready";
  const serverHasUpdate = hasNewUpdate && updateStatus?.server?.newVersion;
  const webHasUpdate = hasNewUpdate && updateStatus?.web?.newVersion;

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title="版本信息">
        <div className="divide-y divide-border">
          {/* Electron 版本 */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">桌面端</div>
              <div className="text-xs text-muted-foreground">v{currentVersion}</div>
            </div>
          </div>

          {/* Server 版本 */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">服务端</div>
                {serverHasUpdate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <Download className="h-3 w-3" />
                    有更新
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                v{serverVersion}
                {serverHasUpdate && ` → v${updateStatus?.server?.newVersion}`}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void openChangelog("server", serverVersion)}
            >
              <FileText className="h-3.5 w-3.5" />
              更新日志
            </Button>
          </div>

          {/* Web 版本 */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">Web</div>
                {webHasUpdate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <Download className="h-3 w-3" />
                    有更新
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                v{webVersion}
                {webHasUpdate && ` → v${updateStatus?.web?.newVersion}`}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void openChangelog("web", webVersion)}
            >
              <FileText className="h-3.5 w-3.5" />
              更新日志
            </Button>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      {/* 更新检查 */}
      {isElectron && (
        <OpenLoafSettingsGroup title="更新">
          <div className="px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-1">增量更新</div>
                <div className="text-xs text-muted-foreground">{updateLabel}</div>
              </div>
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
        </OpenLoafSettingsGroup>
      )}

      <OpenLoafSettingsGroup title="状态">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">客户端ID</div>
            <OpenLoafSettingsField className="max-w-[70%]">
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
            </OpenLoafSettingsField>
          </div>
          {isElectron ? (
            <div className="flex flex-wrap items-start gap-3 px-3 py-3">
              <div className="text-sm font-medium">WebContentsView数</div>
              <OpenLoafSettingsField className="max-w-[70%] gap-2">
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
              </OpenLoafSettingsField>
            </div>
          ) : null}
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title="操作">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">页面重新加载</div>
              <div className="text-xs text-muted-foreground">刷新整个页面</div>
            </div>
            <OpenLoafSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={reloadPage}>
                刷新
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">重新进入初始化</div>
            <OpenLoafSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={() => void restartSetup()}>
                进入
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title="信息">
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
      </OpenLoafSettingsGroup>

      {/* Changelog Sheet */}
      <Sheet open={changelogSheet.open} onOpenChange={(open) => setChangelogSheet((prev) => ({ ...prev, open }))}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {changelogSheet.component === "server" ? "服务端" : "Web"} 更新日志
            </SheetTitle>
            <SheetDescription>
              版本 {changelogSheet.version}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {changelogSheet.loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                加载中...
              </div>
            ) : (
              <Streamdown mode="static" className="prose prose-sm dark:prose-invert max-w-none">
                {changelogSheet.content ?? ""}
              </Streamdown>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
