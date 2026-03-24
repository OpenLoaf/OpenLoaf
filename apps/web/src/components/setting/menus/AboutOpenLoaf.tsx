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
import { Switch } from "@openloaf/ui/switch";
import { useTranslation } from "react-i18next";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { resolveSaasBaseUrl, openExternalUrl } from "@/lib/saas-auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  BookOpen,
  Bug,
  ChevronRight,
  CircleAlert,
  Code2,
  Download,
  FileText,
  Fingerprint,
  FlaskConical,
  FolderOpen,
  Globe,
  Loader2,
  Mail,
  Monitor,
  RefreshCw,
  Scale,
  ScrollText,
  Server,
  Shield,
} from "lucide-react";
import * as React from "react";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { isElectronEnv } from "@/utils/is-electron-env";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@openloaf/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@openloaf/ui/accordion";
import { Streamdown } from "streamdown";

const UPDATE_BASE_URL = process.env.NEXT_PUBLIC_UPDATE_BASE_URL;

/**
 * Build changelog URL for a given component and version.
 * Points to R2 update server (NEXT_PUBLIC_UPDATE_BASE_URL).
 */
function buildChangelogUrl(component: "server" | "web" | "desktop", version: string): string | undefined {
  if (!UPDATE_BASE_URL || version === "—" || version === "bundled") return undefined;
  return `${UPDATE_BASE_URL}/changelogs/${component}/${version}`;
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

/** Flat-color icon badge for settings items. */
function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

export function AboutOpenLoaf() {
  const { t } = useTranslation('settings');
  const { basic, setBasic } = useBasicConfig();
  const clientId = getWebClientId();
  const [copiedKey, setCopiedKey] = React.useState<"clientId" | null>(null);

  const [appVersion, setAppVersion] = React.useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<OpenLoafIncrementalUpdateStatus | null>(
    null,
  );
  const [changelogSheet, setChangelogSheet] = React.useState<{
    open: boolean;
    changelogs: Record<string, { content: string | null; loading: boolean }>;
  }>({
    open: false,
    changelogs: {},
  });
  const isElectron = React.useMemo(() => isElectronEnv(), []);
  // 开发模式下禁用更新功能（pnpm desktop）。
  const isDevDesktop = isElectron && process.env.NODE_ENV !== "production";
  const [autoUpdateStatus, setAutoUpdateStatus] = React.useState<OpenLoafAutoUpdateStatus | null>(null);
  const [updateChannel, setUpdateChannel] = React.useState<"stable" | "beta">("stable");
  const [channelSwitching, setChannelSwitching] = React.useState(false);

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

  /** Fetch desktop auto-update status from Electron main process. */
  const fetchAutoUpdateStatus = React.useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.getAutoUpdateStatus) return;
    try {
      const status = await api.getAutoUpdateStatus();
      if (status) setAutoUpdateStatus(status);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Fetch current update channel. */
  const fetchUpdateChannel = React.useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.getUpdateChannel) return;
    try {
      const ch = await api.getUpdateChannel();
      if (ch) setUpdateChannel(ch);
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Switch update channel. */
  const handleChannelSwitch = React.useCallback(async (beta: boolean) => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.switchUpdateChannel) return;
    const target = beta ? "beta" : "stable";
    setChannelSwitching(true);
    try {
      const res = await api.switchUpdateChannel(target);
      if (res?.ok) setUpdateChannel(target);
    } catch {
      // ignore
    } finally {
      setChannelSwitching(false);
    }
  }, [isElectron]);

  /** Trigger update check: desktop first, then incremental. */
  const triggerUpdateAction = React.useCallback(async () => {
    const api = window.openloafElectron;
    // 开发模式禁用更新检查，避免触发无效请求。
    if (!isElectron || isDevDesktop || !api) return;
    // 优先触发 desktop 整包更新检查，同时也检查增量更新。
    await Promise.all([
      api.checkDesktopUpdate?.(),
      api.checkIncrementalUpdate?.(),
    ]);
  }, [isElectron, isDevDesktop]);

  React.useEffect(() => {
    if (!isElectron) return;
    void fetchAppVersion();
    void fetchUpdateStatus();
    void fetchUpdateChannel();
    void fetchAutoUpdateStatus();
  }, [isElectron, fetchAppVersion, fetchUpdateStatus, fetchUpdateChannel, fetchAutoUpdateStatus]);

  React.useEffect(() => {
    if (!isElectron) return;

    const onUpdateStatus = (event: Event) => {
      const detail = (event as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail;
      if (!detail) return;
      setUpdateStatus(detail);
    };

    const onAutoUpdateStatus = (event: Event) => {
      const detail = (event as CustomEvent<OpenLoafAutoUpdateStatus>).detail;
      if (!detail) return;
      setAutoUpdateStatus(detail);
    };

    window.addEventListener("openloaf:incremental-update:status", onUpdateStatus);
    window.addEventListener("openloaf:auto-update:status", onAutoUpdateStatus);
    return () => {
      window.removeEventListener("openloaf:incremental-update:status", onUpdateStatus);
      window.removeEventListener("openloaf:auto-update:status", onAutoUpdateStatus);
    };
  }, [isElectron]);

  /** Reload the current page. */
  const reloadPage = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  /**
   * Toggle chat preface viewer button.
   */
  const handleToggleChatPreface = React.useCallback((checked: boolean) => {
    // 逻辑：实时控制 Chat Header 是否展示 Preface 查看按钮。
    void setBasic({ chatPrefaceEnabled: checked });
  }, [setBasic]);

  const currentVersion = appVersion ?? "—";
  const serverVersion = updateStatus?.server?.version ?? "—";
  const webVersion = updateStatus?.web?.version ?? "—";

  /** Open changelog sheet and fetch all changelogs in parallel. */
  const openAllChangelogs = React.useCallback(async () => {
    const components: Array<{ key: string; component: "server" | "web" | "desktop"; version: string }> = [
      { key: "desktop", component: "desktop", version: currentVersion },
      { key: "server", component: "server", version: serverVersion },
      { key: "web", component: "web", version: webVersion },
    ];

    const initial: Record<string, { content: string | null; loading: boolean }> = {};
    for (const c of components) {
      initial[c.key] = { content: null, loading: true };
    }
    setChangelogSheet({ open: true, changelogs: initial });

    const lang = primaryLang(basic.uiLanguage ?? "zh-CN");
    await Promise.all(
      components.map(async (c) => {
        const url = buildChangelogUrl(c.component, c.version);
        const content = url ? await fetchChangelogWithLang(url, lang) : null;
        setChangelogSheet((prev) => ({
          ...prev,
          changelogs: {
            ...prev.changelogs,
            [c.key]: { content, loading: false },
          },
        }));
      }),
    );
  }, [basic.uiLanguage, currentVersion, serverVersion, webVersion]);

  /** Format a version string with "v" prefix, unless it's a placeholder. */
  const fmtVersion = (v: string) => {
    if (v === "—") return v;
    if (v === "bundled") return t('aboutAdditions.bundledVersion');
    return `v${v}`;
  };

  // Desktop 整包更新是否活跃（正在下载或已下载）
  const isDesktopUpdating = autoUpdateStatus != null &&
    (autoUpdateStatus.state === "available" || autoUpdateStatus.state === "downloading" || autoUpdateStatus.state === "downloaded");

  /** Format bytes into human-readable MB string. */
  const fmtMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  const fmtSpeed = (bps: number) => (bps / 1024 / 1024).toFixed(2);

  // Desktop 整包更新状态文案
  const desktopUpdateLabel = React.useMemo(() => {
    if (!autoUpdateStatus) return null;
    const p = autoUpdateStatus.progress;
    switch (autoUpdateStatus.state) {
      case "checking":
        return t('aboutAdditions.checking');
      case "available":
        return `${t('aboutAdditions.desktop')} v${autoUpdateStatus.nextVersion ?? "?"} ${t('aboutAdditions.hasUpdate')}`;
      case "downloading":
        if (p) {
          return `${t('aboutAdditions.downloading')}${t('aboutAdditions.desktop')} v${autoUpdateStatus.nextVersion ?? "?"} — ${Math.round(p.percent)}% (${fmtMB(p.transferred)}/${fmtMB(p.total)} MB, ${fmtSpeed(p.bytesPerSecond)} MB/s)`;
        }
        return t('aboutAdditions.downloadingUpdate');
      case "downloaded":
        return `${t('aboutAdditions.desktop')} v${autoUpdateStatus.nextVersion ?? "?"} ${t('aboutAdditions.readyRestart')}`;
      case "error":
        return autoUpdateStatus.error
          ? `${t('aboutAdditions.desktop')} ${t('aboutAdditions.checkFailed')}：${autoUpdateStatus.error}`
          : null;
      default:
        return null;
    }
  }, [autoUpdateStatus, t]);

  const downloadPercent = updateStatus?.progress?.percent;
  const updateLabel = React.useMemo(() => {
    if (!isElectron) return t('aboutAdditions.webNoIncrement');
    if (isDevDesktop) return t('aboutAdditions.devModeClosed');
    // Desktop 整包更新优先级更高，增量更新会被跳过
    if (isDesktopUpdating) return t('aboutAdditions.waitingCheck');
    if (!updateStatus) return t('aboutAdditions.waitingCheck');
    const componentLabel =
      updateStatus.progress?.component === "server" ? t('aboutAdditions.server') : "Web";
    // 兼容 idle 状态下仍有错误提示的情况（例如 Electron 版本过低）。
    if (updateStatus.state === "idle" && updateStatus.error) {
      return `${t('aboutAdditions.checkFailed')}：${updateStatus.error}`;
    }
    switch (updateStatus.state) {
      case "checking":
        return t('aboutAdditions.checking');
      case "downloading":
        return updateStatus.progress
          ? `${t('aboutAdditions.downloading')}${componentLabel}${t('aboutAdditions.updatePercent', { percent: Math.round(downloadPercent ?? 0) })}`
          : t('aboutAdditions.downloadingUpdate');
      case "ready":
        return t('aboutAdditions.readyRestart');
      case "error":
        return updateStatus.error
          ? `${t('aboutAdditions.checkFailed')}：${updateStatus.error}`
          : t('aboutAdditions.checkFailedRetry');
      case "idle":
      default:
        return updateStatus.lastCheckedAt ? t('aboutAdditions.isLatest') : t('aboutAdditions.waitingCheck');
    }
  }, [isElectron, isDevDesktop, isDesktopUpdating, updateStatus, downloadPercent, t]);

  const isChecking = updateStatus?.state === "checking" || autoUpdateStatus?.state === "checking";
  const updateActionLabel = isDevDesktop
    ? t('aboutAdditions.devModeUnavailable')
    : updateStatus?.state === "ready"
      ? t('aboutAdditions.updateReady')
      : isChecking
        ? t('aboutAdditions.checking')
        : t('aboutAdditions.checkUpdate');
  const updateActionDisabled =
    !isElectron ||
    isDevDesktop ||
    isDesktopUpdating ||
    isChecking ||
    updateStatus?.state === "downloading" ||
    updateStatus?.state === "ready";

  const hasNewUpdate = updateStatus?.state === "ready";
  const serverHasUpdate = hasNewUpdate && updateStatus?.server?.newVersion;
  const webHasUpdate = hasNewUpdate && updateStatus?.web?.newVersion;

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title={t('aboutAdditions.versionInfo')}>
        <div className="divide-y divide-border/40">
          {/* 版本一行显示 */}
          <div className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <SettingIcon icon={Monitor} bg="bg-secondary" fg="text-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('aboutAdditions.currentVersion')}</div>
                <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span>{t('aboutAdditions.desktop')} {fmtVersion(currentVersion)}</span>
                  <span>·</span>
                  <span>{t('aboutAdditions.server')} {fmtVersion(serverVersion)}</span>
                  <span>·</span>
                  <span>Web {fmtVersion(webVersion)}</span>
                </div>
              </div>
              <OpenLoafSettingsField className="shrink-0 justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 rounded-3xl text-muted-foreground shadow-none"
                  onClick={() => void openAllChangelogs()}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('aboutAdditions.changelog')}
                </Button>
                {isElectron && (
                  <Button
                    size="sm"
                    className="h-8 rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent shadow-none"
                    disabled={updateActionDisabled}
                    onClick={() => void triggerUpdateAction()}
                  >
                    {isChecking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {updateActionLabel}
                  </Button>
                )}
              </OpenLoafSettingsField>
            </div>
            {/* Desktop 更新状态标签 */}
            {(autoUpdateStatus?.state === "downloaded" || autoUpdateStatus?.state === "downloading") && (
              <div className="mt-2 flex items-center gap-2">
                {autoUpdateStatus.state === "downloaded" && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-3xl bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      <Download className="h-3 w-3" />
                      {t('aboutAdditions.desktop')} v{autoUpdateStatus.nextVersion ?? "?"} {t('aboutAdditions.readyRestart')}
                    </span>
                    <Button
                      size="sm"
                      className="rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent shadow-none"
                      onClick={() => void window.openloafElectron?.relaunchApp?.()}
                    >
                      {t('aboutAdditions.installNow')}
                    </Button>
                  </>
                )}
                {autoUpdateStatus.state === "downloading" && autoUpdateStatus.progress && (
                  <div className="w-full space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground transition-all duration-300"
                        style={{ width: `${Math.min(autoUpdateStatus.progress.percent, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('aboutAdditions.downloading')}{t('aboutAdditions.desktop')} v{autoUpdateStatus.nextVersion ?? "?"} — {Math.round(autoUpdateStatus.progress.percent)}% ({fmtMB(autoUpdateStatus.progress.transferred)}/{fmtMB(autoUpdateStatus.progress.total)} MB, {fmtSpeed(autoUpdateStatus.progress.bytesPerSecond)} MB/s)
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Server / Web 增量更新提示 */}
            {(serverHasUpdate || webHasUpdate) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {serverHasUpdate && (
                  <span className="inline-flex items-center gap-1 rounded-3xl bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    <Download className="h-3 w-3" />
                    {t('aboutAdditions.server')} → v{updateStatus?.server?.newVersion}
                  </span>
                )}
                {webHasUpdate && (
                  <span className="inline-flex items-center gap-1 rounded-3xl bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    <Download className="h-3 w-3" />
                    Web → v{updateStatus?.web?.newVersion}
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Beta 渠道 */}
          {isElectron && (
            <div className="flex flex-wrap items-center gap-2 py-3">
              <SettingIcon icon={FlaskConical} bg="bg-secondary" fg="text-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('aboutAdditions.betaChannel')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('aboutAdditions.betaChannelDesc')}
                </div>
              </div>
              <OpenLoafSettingsField className="shrink-0 justify-end">
                <Switch
                  checked={updateChannel === "beta"}
                  disabled={channelSwitching || isDevDesktop}
                  onCheckedChange={(checked) => void handleChannelSwitch(checked)}
                />
              </OpenLoafSettingsField>
            </div>
          )}
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t('aboutAdditions.actions')}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={RefreshCw} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('aboutAdditions.pageReload')}</div>
              <div className="text-xs text-muted-foreground">{t('aboutAdditions.reloadDesc')}</div>
            </div>
            <OpenLoafSettingsField>
              <Button type="button" size="sm" className="rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent shadow-none" onClick={reloadPage}>
                {t('aboutAdditions.reload')}
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Bug} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('aboutAdditions.aiDebugMode')}</div>
              <div className="text-xs text-muted-foreground">{t('aboutAdditions.aiDebugModeDesc')}</div>
            </div>
            <OpenLoafSettingsField className="shrink-0 justify-end">
              <Switch
                checked={Boolean(basic.chatPrefaceEnabled)}
                onCheckedChange={handleToggleChatPreface}
                aria-label={t('aboutAdditions.aiDebugMode')}
              />
            </OpenLoafSettingsField>
          </div>
          {isElectron ? (
            <div className="flex flex-wrap items-center gap-2 py-3">
              <SettingIcon icon={ScrollText} bg="bg-secondary" fg="text-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('aboutAdditions.openLogsFolder')}</div>
                <div className="text-xs text-muted-foreground">{t('aboutAdditions.openLogsFolderDesc')}</div>
              </div>
              <OpenLoafSettingsField>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-3xl bg-secondary text-secondary-foreground hover:bg-accent shadow-none"
                  onClick={() => void window.openloafElectron?.openLogsFolder?.()}
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t('aboutAdditions.open')}
                </Button>
              </OpenLoafSettingsField>
            </div>
          ) : null}
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t('aboutAdditions.info')}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Fingerprint} bg="bg-secondary" fg="text-muted-foreground" />
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
          <div
            className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors"
            onClick={() => void openExternalUrl('https://openloaf.hexems.com')}
          >
            <SettingIcon icon={Globe} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.officialWebsite')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors"
            onClick={() => void openExternalUrl(`${resolveSaasBaseUrl()}/terms`)}
          >
            <SettingIcon icon={Scale} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.license')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors"
            onClick={() => void openExternalUrl(`${resolveSaasBaseUrl()}/privacy`)}
          >
            <SettingIcon icon={Shield} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.privacy')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div
            className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors"
            onClick={() => void openExternalUrl(`${resolveSaasBaseUrl()}/opensource`)}
          >
            <SettingIcon icon={Code2} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.oss')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors">
            <SettingIcon icon={BookOpen} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.docs')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors">
            <SettingIcon icon={Mail} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.contact')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 py-3 cursor-pointer hover:bg-accent/50 -mx-2 px-2 rounded-3xl transition-colors">
            <SettingIcon icon={CircleAlert} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1 text-sm font-medium">{t('aboutAdditions.issues')}</div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </OpenLoafSettingsGroup>

      {/* Changelog Sheet */}
      <Sheet open={changelogSheet.open} onOpenChange={(open) => setChangelogSheet((prev) => ({ ...prev, open }))}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('aboutAdditions.allChangelogs')}</SheetTitle>
          </SheetHeader>
          <div className="px-4">
            <Accordion type="multiple" defaultValue={["desktop", "server", "web"]}>
              {[
                { key: "desktop", label: t('aboutAdditions.desktop'), version: currentVersion, icon: Monitor, bg: "bg-secondary", fg: "text-foreground" },
                { key: "server", label: t('aboutAdditions.server'), version: serverVersion, icon: Server, bg: "bg-secondary", fg: "text-foreground" },
                { key: "web", label: "Web", version: webVersion, icon: Globe, bg: "bg-secondary", fg: "text-foreground" },
              ].map((item) => {
                const entry = changelogSheet.changelogs[item.key];
                // 尚未加载或加载完成后 content 为空（404）则不显示该分组
                if (!entry || (!entry.loading && !entry.content)) return null;
                return (
                  <AccordionItem key={item.key} value={item.key}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <SettingIcon icon={item.icon} bg={item.bg} fg={item.fg} />
                        <span>{item.label}</span>
                        <span className="text-xs text-muted-foreground">{fmtVersion(item.version)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {entry?.loading ? (
                        <div className="flex items-center justify-center py-6 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {t('aboutAdditions.loading')}
                        </div>
                      ) : (
                        <Streamdown mode="static" className="prose prose-sm dark:prose-invert max-w-none">
                          {entry!.content!}
                        </Streamdown>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
