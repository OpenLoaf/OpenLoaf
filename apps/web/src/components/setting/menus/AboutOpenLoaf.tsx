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
import { useTranslation } from "react-i18next";
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
const CHANGELOG_GITHUB_RAW =
  "https://raw.githubusercontent.com/OpenLoaf/OpenLoaf/main";

/**
 * Build changelog URL for a given component and version.
 * Points directly to GitHub raw content (public repo).
 */
function buildChangelogUrl(component: "server" | "web", version: string): string | undefined {
  if (version === "—" || version === "bundled") return undefined;
  return `${CHANGELOG_GITHUB_RAW}/apps/${component}/changelogs/${version}`;
}

// ITEMS moved inside component to support translation

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
  const { t } = useTranslation('settings');
  const { basic, setBasic } = useBasicConfig();
  const clientId = getWebClientId();
  const [copiedKey, setCopiedKey] = React.useState<"clientId" | null>(null);

  // Build ITEMS with translations
  const ITEMS = React.useMemo(() => [
    { key: "license", label: t('about.license') },
    { key: "privacy", label: t('about.privacy') },
    { key: "oss", label: t('about.oss') },
    { key: "docs", label: t('about.docs') },
    { key: "contact", label: t('about.contact') },
    { key: "issues", label: t('about.issues') },
  ], [t]);
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
        content: content || "t('aboutAdditions.changelog')",
        loading: false,
      }));
    } else {
      setChangelogSheet((prev) => ({
        ...prev,
        content: "t('aboutAdditions.changelog')",
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
    if (!isElectron) return t('about.webNoIncrement');
    if (isDevDesktop) return t('about.devModeClosed');
    if (!updateStatus) return t('about.waitingCheck');
    const componentLabel =
      updateStatus.progress?.component === "server" ? t('about.server') : "Web";
    // 兼容 idle 状态下仍有错误提示的情况（例如 Electron 版本过低）。
    if (updateStatus.state === "idle" && updateStatus.error) {
      return `${t('about.checkFailed')}：${updateStatus.error}`;
    }
    switch (updateStatus.state) {
      case "checking":
        return t('about.checking');
      case "downloading":
        return updateStatus.progress
          ? `${t('about.downloading')}${componentLabel}${t('about.updatePercent', { percent: Math.round(downloadPercent ?? 0) })}`
          : t('about.downloadingUpdate');
      case "ready":
        return t('about.readyRestart');
      case "error":
        return updateStatus.error
          ? `${t('about.checkFailed')}：${updateStatus.error}`
          : t('about.checkFailedRetry');
      case "idle":
      default:
        return updateStatus.lastCheckedAt ? t('about.isLatest') : t('about.waitingCheck');
    }
  }, [isElectron, isDevDesktop, updateStatus, downloadPercent, t]);

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
      <OpenLoafSettingsGroup title={t('aboutAdditions.versionInfo')}>
        <div className="divide-y divide-border">
          {/* Electron 版本 */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t('aboutAdditions.desktop')}</div>
              <div className="text-xs text-muted-foreground">v{currentVersion}</div>
            </div>
          </div>

          {/* Server 版本 */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">{t('aboutAdditions.server')}</div>
                {serverHasUpdate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <Download className="h-3 w-3" />
                    {t('aboutAdditions.hasUpdate')}
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
              {t('aboutAdditions.changelog')}
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
                    {t('aboutAdditions.hasUpdate')}
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
              {t('aboutAdditions.changelog')}
            </Button>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      {/* 更新检查 */}
      {isElectron && (
        <OpenLoafSettingsGroup title={t('aboutAdditions.updateCheck')}>
          <div className="px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-1">{t('aboutAdditions.incrementalUpdate')}</div>
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

      <OpenLoafSettingsGroup title={t('aboutAdditions.status')}>
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">{t('aboutAdditions.clientId')}</div>
            <OpenLoafSettingsField className="max-w-[70%]">
              <button
                type="button"
                aria-label={t('aboutAdditions.clickCopy')}
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
                {copiedKey === "clientId" ? t('common:copy') : clientId || "—"}
              </button>
            </OpenLoafSettingsField>
          </div>
          {isElectron ? (
            <div className="flex flex-wrap items-start gap-3 px-3 py-3">
              <div className="text-sm font-medium">{t('aboutAdditions.webContentsViewCount')}</div>
              <OpenLoafSettingsField className="max-w-[70%] gap-2">
                <button
                  type="button"
                  aria-label={t('aboutAdditions.clickRefresh')}
                  title={t('aboutAdditions.clickRefresh')}
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
                  aria-label={t('aboutAdditions.clearWebContents')}
                  disabled={webContentsViewCount == null || webContentsViewCount === 0}
                  onClick={() => void clearWebContentsViews()}
                >
                  {t('aboutAdditions.clearWebContents')}
                </Button>
              </OpenLoafSettingsField>
            </div>
          ) : null}
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t('aboutAdditions.actions')}>
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t('aboutAdditions.pageReload')}</div>
              <div className="text-xs text-muted-foreground">{t('aboutAdditions.reloadDesc')}</div>
            </div>
            <OpenLoafSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={reloadPage}>
                {t('aboutAdditions.reload')}
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-3 px-3 py-3">
            <div className="text-sm font-medium">{t('aboutAdditions.restartSetup')}</div>
            <OpenLoafSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={() => void restartSetup()}>
                {t('aboutAdditions.enter')}
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t('aboutAdditions.info')}>
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
              {t('aboutAdditions.changelogTitle', { component: changelogSheet.component === "server" ? t('aboutAdditions.server') : "Web" })}
            </SheetTitle>
            <SheetDescription>
              {t('aboutAdditions.version')} {changelogSheet.version}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {changelogSheet.loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t('aboutAdditions.loading')}
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
