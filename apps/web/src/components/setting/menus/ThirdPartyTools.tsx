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

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { Claude, OpenAI } from "@lobehub/icons";
import { Switch } from "@openloaf/ui/animate-ui/components/radix/switch";
import { toast } from "sonner";
import type { CliToolConfig, CliToolsConfig } from "@openloaf/api/types/basic";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { queryClient, trpc } from "@/utils/trpc";

type CliToolKind = keyof CliToolsConfig;
type CliToolSettings = CliToolConfig;

type CliToolStatus = {
  /** Tool id. */
  id: CliToolKind;
  /** Whether CLI tool is installed. */
  installed: boolean;
  /** Current CLI version. */
  version?: string;
  /** Latest version from npm. */
  latestVersion?: string;
  /** Whether an update is available. */
  hasUpdate?: boolean;
  /** Installed binary path. */
  path?: string;
};

type OfficeInfo = {
  wps: {
    installed: boolean;
    path?: string;
    version?: string;
  };
};

type CliStatusMap = Record<CliToolKind, CliToolStatus>;
type CliSettingsMap = CliToolsConfig;

/** Python icon path data. */
const PYTHON_ICON_PATH =
  "M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z";

/** Python icon brand color. */
const PYTHON_ICON_COLOR = "#3776AB";

type PythonIconProps = {
  /** Icon size in pixels. */
  size?: number;
  /** Additional class name. */
  className?: string;
  /** Additional styles. */
  style?: CSSProperties;
};

/** Render Python icon glyph. */
function PythonIcon({ size = 16, className, style }: PythonIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={PYTHON_ICON_PATH} fill="currentColor" />
    </svg>
  );
}

/** Build editable CLI settings from basic config. */
function buildCliSettingsFromBasic(cliTools: CliToolsConfig): CliSettingsMap {
  return {
    codex: {
      apiUrl: cliTools.codex.apiUrl,
      apiKey: cliTools.codex.apiKey,
      forceCustomApiKey: cliTools.codex.forceCustomApiKey,
    },
    claudeCode: {
      apiUrl: cliTools.claudeCode.apiUrl,
      apiKey: cliTools.claudeCode.apiKey,
      forceCustomApiKey: cliTools.claudeCode.forceCustomApiKey,
    },
    python: {
      apiUrl: cliTools.python.apiUrl,
      apiKey: cliTools.python.apiKey,
      forceCustomApiKey: cliTools.python.forceCustomApiKey,
    },
  };
}

/** Build CLI status map from query data. */
function buildCliStatusMap(list?: CliToolStatus[]): CliStatusMap {
  const fallback: CliStatusMap = {
    codex: { id: "codex", installed: false },
    claudeCode: { id: "claudeCode", installed: false },
    python: { id: "python", installed: false },
  };
  if (!list?.length) return fallback;
  // 逻辑：服务端返回按 id 覆盖默认项，保证 UI 总是有值。
  for (const item of list) {
    fallback[item.id] = item;
  }
  return fallback;
}

/** Compose the third-party tools settings. */
export function ThirdPartyTools() {
  const { t } = useTranslation('settings');
  const { basic, setBasic } = useBasicConfig();
  const [cliSettings, setCliSettings] = useState<CliSettingsMap>(() =>
    buildCliSettingsFromBasic(basic.cliTools),
  );
  /** Active CLI settings dialog target. */
  const [activeCliTool, setActiveCliTool] = useState<CliToolKind>("codex");
  /** Whether CLI settings dialog is open. */
  const [cliDialogOpen, setCliDialogOpen] = useState(false);

  const cliStatusQuery = useQuery({
    ...trpc.settings.getCliToolsStatus.queryOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const systemCliInfoQuery = useQuery({
    ...trpc.settings.systemCliInfo.queryOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const officeInfoQuery = useQuery({
    ...trpc.settings.officeInfo.queryOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const cliStatuses = useMemo(
    () => buildCliStatusMap(cliStatusQuery.data as CliToolStatus[] | undefined),
    [cliStatusQuery.data],
  );
  const isCliStatusLoading = cliStatusQuery.isLoading && !cliStatusQuery.data;
  const systemCliInfo = systemCliInfoQuery.data;
  const isSystemCliLoading = systemCliInfoQuery.isLoading && !systemCliInfo;
  const officeInfo = officeInfoQuery.data as OfficeInfo | undefined;
  const wpsInfo = officeInfo?.wps;
  const isOfficeInfoLoading = officeInfoQuery.isLoading && !officeInfo;

  const systemVersionValue = useMemo(() => {
    if (isSystemCliLoading) return t('thirdPartyTools.detecting');
    if (!systemCliInfo) return t('thirdPartyTools.unknown');
    // 逻辑：兼容旧缓存或旧接口缺少 system 字段的情况。
    const fallbackName =
      systemCliInfo.platform === "darwin"
        ? "macOS"
        : systemCliInfo.platform === "linux"
          ? "Linux"
          : systemCliInfo.platform === "win32"
            ? "Windows"
            : t('thirdPartyTools.unknown');
    const name = systemCliInfo.system?.name || fallbackName;
    const version = systemCliInfo.system?.version
      ? ` ${systemCliInfo.system.version}`
      : "";
    return `${name}${version}`;
  }, [isSystemCliLoading, systemCliInfo, t]);

  const shellSupportLabel = useMemo(() => {
    // 逻辑：优先展示检测状态，其次拼接 shell 版本与路径。
    if (isSystemCliLoading) return t('thirdPartyTools.detecting');
    if (!systemCliInfo?.shell.available) return t('thirdPartyTools.noShellSupport');
    const name =
      systemCliInfo.shell.name === "powershell" ? "PowerShell" : "bash";
    const version = systemCliInfo.shell.version
      ? ` · ${t('thirdPartyTools.version')}：${systemCliInfo.shell.version}`
      : "";
    const path = systemCliInfo.shell.path
      ? ` · ${t('thirdPartyTools.path')}：${systemCliInfo.shell.path}`
      : "";
    return `${name}${version}${path}`;
  }, [isSystemCliLoading, systemCliInfo, t]);

  const wpsStatusLabel = useMemo(() => {
    if (isOfficeInfoLoading) return t('thirdPartyTools.detecting');
    if (!wpsInfo) return t('thirdPartyTools.unknown');
    if (!wpsInfo.installed) return t('thirdPartyTools.notInstalled');
    const version = wpsInfo.version ? ` · ${t('thirdPartyTools.version')}：${wpsInfo.version}` : "";
    const pathLabel = wpsInfo.path ? ` · ${t('thirdPartyTools.path')}：${wpsInfo.path}` : "";
    return `${t('thirdPartyTools.installed')}${version}${pathLabel}`;
  }, [isOfficeInfoLoading, wpsInfo, t]);

  /** Update cached CLI status list. */
  const updateCliStatusCache = (nextStatus: CliToolStatus) => {
    // 逻辑：局部更新缓存，避免每次操作后全量请求。
    queryClient.setQueryData(
      trpc.settings.getCliToolsStatus.queryOptions().queryKey,
      (prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const index = list.findIndex(
          (item: CliToolStatus) => item.id === nextStatus.id,
        );
        if (index >= 0) {
          list[index] = nextStatus;
        } else {
          list.push(nextStatus);
        }
        return list;
      },
    );
  };

  const installCliMutation = useMutation(
    trpc.settings.installCliTool.mutationOptions({
      onSuccess: (result) => {
        updateCliStatusCache(result.status as CliToolStatus);
        toast.success(t('thirdPartyTools.installSuccess'));
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const checkUpdateMutation = useMutation(
    trpc.settings.checkCliToolUpdate.mutationOptions({
      onSuccess: (result) => {
        const status = result.status as CliToolStatus;
        updateCliStatusCache(status);
        if (status.hasUpdate && status.latestVersion) {
          toast.message(t('thirdPartyTools.foundUpdate', { version: status.latestVersion }));
          return;
        }
        if (status.latestVersion) {
          toast.success(t('thirdPartyTools.isLatest'));
          return;
        }
        toast.message(t('thirdPartyTools.cannotGetLatest'));
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  /** Resolve CLI tool version label. */
  const resolveCliVersionLabel = (status: CliToolStatus) => {
    // 逻辑：优先显示安装版本，其次显示安装状态。
    if (isCliStatusLoading) return t('thirdPartyTools.detecting');
    if (status.installed && status.version) return `v${status.version}`;
    if (status.installed) return t('thirdPartyTools.installed_label');
    return t('thirdPartyTools.notInstalled_label');
  };

  /** Trigger install or update check based on current status. */
  const handleCliPrimaryAction = async (tool: CliToolKind) => {
    const status = cliStatuses[tool];
    // 逻辑：已安装走更新检查，未安装走安装。
    if (status.installed && status.hasUpdate && status.latestVersion) {
      await installCliMutation.mutateAsync({ id: tool });
      return;
    }
    if (status.installed) {
      await checkUpdateMutation.mutateAsync({ id: tool });
      return;
    }
    await installCliMutation.mutateAsync({ id: tool });
  };

  /** Save CLI tool settings to basic config. */
  const handleSaveCliSettings = async () => {
    try {
      // 逻辑：统一保存整组 CLI 配置，避免只更新局部导致丢失。
      await setBasic({ cliTools: cliSettings });
      toast.success(t('thirdPartyTools.saved'));
      setCliDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('thirdPartyTools.save');
      toast.error(message);
    }
  };

  useEffect(() => {
    if (cliDialogOpen) return;
    setCliSettings(buildCliSettingsFromBasic(basic.cliTools));
  }, [basic.cliTools, cliDialogOpen]);

  /** CLI tool labels. */
  const cliToolLabels: Record<CliToolKind, string> = {
    codex: t('thirdPartyTools.codex'),
    claudeCode: t('thirdPartyTools.claudeCode'),
    python: t('thirdPartyTools.python'),
  };
  /** CLI tool descriptions. */
  const cliToolDescriptions: Record<CliToolKind, string> = {
    codex: t('thirdPartyTools.codexDesc'),
    claudeCode: t('thirdPartyTools.claudeCodeDesc'),
    python: t('thirdPartyTools.pythonDesc'),
  };
  const cliDialogTitle = t('thirdPartyTools.setupDialog', { tool: cliToolLabels[activeCliTool] });

  /** Open CLI settings dialog for a tool. */
  const openCliSettings = (tool: CliToolKind) => {
    setActiveCliTool(tool);
    setCliDialogOpen(true);
  };

  /** Update CLI settings with a partial patch. */
  const updateCliSettings = (tool: CliToolKind, patch: Partial<CliToolSettings>) => {
    setCliSettings((prev) => ({
      ...prev,
      [tool]: { ...prev[tool], ...patch },
    }));
  };

  const activeCliSettings = cliSettings[activeCliTool];

  /** Copy text to clipboard for system info display. */
  const handleCopySystemInfo = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 逻辑：剪贴板 API 失败时走降级复制。
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    toast.success(t('common:copy'));
  };

  return (
    <div className="space-y-3">
      <OpenLoafSettingsGroup title={t('thirdPartyTools.systemInfo')} subtitle={t('thirdPartyTools.systemInfoDesc')}>
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1 text-sm font-medium">{t('thirdPartyTools.systemVersion')}</div>
            <OpenLoafSettingsField className="flex items-center justify-end text-right text-xs text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
                onClick={() => void handleCopySystemInfo(systemVersionValue)}
                aria-label={t('thirdPartyTools.copySystemVersion')}
                title={t('thirdPartyTools.clickToCopy')}
              >
                {systemVersionValue || "—"}
              </Button>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1 text-sm font-medium">{t('thirdPartyTools.cmdEnv')}</div>
            <OpenLoafSettingsField className="flex items-center justify-end text-right text-xs text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
                onClick={() => void handleCopySystemInfo(shellSupportLabel)}
                aria-label={t('thirdPartyTools.copyCmdEnv')}
                title={t('thirdPartyTools.clickToCopy')}
              >
                {shellSupportLabel || "—"}
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t('thirdPartyTools.title')}>
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <PythonIcon size={16} style={{ color: PYTHON_ICON_COLOR }} />
                <span>{cliToolLabels.python}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cliToolDescriptions.python} · {t('thirdPartyTools.version')}：
                {resolveCliVersionLabel(cliStatuses.python)}
                {cliStatuses.python.path ? ` · ${t('thirdPartyTools.path')}：${cliStatuses.python.path}` : ""}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (installCliMutation.isPending &&
                    installCliMutation.variables?.id === "python") ||
                  (checkUpdateMutation.isPending &&
                    checkUpdateMutation.variables?.id === "python")
                }
                onClick={() => void handleCliPrimaryAction("python")}
              >
                {cliStatuses.python.installed
                  ? installCliMutation.isPending &&
                    installCliMutation.variables?.id === "python"
                    ? t('thirdPartyTools.upgrading')
                    : cliStatuses.python.hasUpdate && cliStatuses.python.latestVersion
                      ? t('thirdPartyTools.upgradeTo', { version: cliStatuses.python.latestVersion })
                      : checkUpdateMutation.isPending &&
                          checkUpdateMutation.variables?.id === "python"
                        ? t('thirdPartyTools.checking')
                        : t('thirdPartyTools.detectUpdate')
                  : installCliMutation.isPending &&
                      installCliMutation.variables?.id === "python"
                    ? t('thirdPartyTools.installing')
                    : t('thirdPartyTools.install')}
              </Button>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <OpenAI
                  size={16}
                  style={{ color: OpenAI.colorPrimary }}
                  className="dark:!text-white"
                  aria-hidden="true"
                />
                <span>{cliToolLabels.codex}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cliToolDescriptions.codex} · {t('thirdPartyTools.version')}：{resolveCliVersionLabel(cliStatuses.codex)}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (installCliMutation.isPending &&
                    installCliMutation.variables?.id === "codex") ||
                  (checkUpdateMutation.isPending &&
                    checkUpdateMutation.variables?.id === "codex")
                }
                onClick={() => void handleCliPrimaryAction("codex")}
              >
                {cliStatuses.codex.installed
                  ? installCliMutation.isPending &&
                    installCliMutation.variables?.id === "codex"
                    ? t('thirdPartyTools.upgrading')
                    : cliStatuses.codex.hasUpdate && cliStatuses.codex.latestVersion
                      ? t('thirdPartyTools.upgradeTo', { version: cliStatuses.codex.latestVersion })
                      : checkUpdateMutation.isPending &&
                          checkUpdateMutation.variables?.id === "codex"
                        ? t('thirdPartyTools.checking')
                        : t('thirdPartyTools.detectUpdate')
                  : installCliMutation.isPending &&
                      installCliMutation.variables?.id === "codex"
                    ? t('thirdPartyTools.installing')
                    : t('thirdPartyTools.install')}
              </Button>
              {cliStatuses.codex.installed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCliSettings("codex")}
                >
                  {t('thirdPartyTools.settings')}
                </Button>
              ) : null}
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Claude.Color size={16} aria-hidden="true" />
                <span>{cliToolLabels.claudeCode}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cliToolDescriptions.claudeCode} · {t('thirdPartyTools.version')}：
                {resolveCliVersionLabel(cliStatuses.claudeCode)}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (installCliMutation.isPending &&
                    installCliMutation.variables?.id === "claudeCode") ||
                  (checkUpdateMutation.isPending &&
                    checkUpdateMutation.variables?.id === "claudeCode")
                }
                onClick={() => void handleCliPrimaryAction("claudeCode")}
              >
                {cliStatuses.claudeCode.installed
                  ? installCliMutation.isPending &&
                    installCliMutation.variables?.id === "claudeCode"
                    ? t('thirdPartyTools.upgrading')
                    : cliStatuses.claudeCode.hasUpdate &&
                        cliStatuses.claudeCode.latestVersion
                      ? t('thirdPartyTools.upgradeTo', { version: cliStatuses.claudeCode.latestVersion })
                      : checkUpdateMutation.isPending &&
                          checkUpdateMutation.variables?.id === "claudeCode"
                        ? t('thirdPartyTools.checking')
                        : t('thirdPartyTools.detectUpdate')
                  : installCliMutation.isPending &&
                      installCliMutation.variables?.id === "claudeCode"
                    ? t('thirdPartyTools.installing')
                    : t('thirdPartyTools.install')}
              </Button>
              {cliStatuses.claudeCode.installed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCliSettings("claudeCode")}
                >
                  {t('thirdPartyTools.settings')}
                </Button>
              ) : null}
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t('thirdPartyTools.wps')} subtitle={t('thirdPartyTools.wpsOfficeStatus')}>
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1 text-sm font-medium">{t('thirdPartyTools.wpsOffice')}</div>
            <OpenLoafSettingsField className="flex items-center justify-end gap-2 text-right text-xs text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
                onClick={() => void handleCopySystemInfo(wpsStatusLabel)}
                aria-label={t('thirdPartyTools.copyWpsStatus')}
                title={t('thirdPartyTools.clickToCopy')}
              >
                {wpsStatusLabel || "—"}
              </Button>
              {!isOfficeInfoLoading && !wpsInfo?.installed && (
                <a
                  href="https://platform.wps.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900"
                >
                  {t('thirdPartyTools.download')}
                </a>
              )}
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <Dialog open={cliDialogOpen} onOpenChange={setCliDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cliDialogTitle}</DialogTitle>
            <DialogDescription>{t('thirdPartyTools.configApiDialog')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cli-api-url">{t('thirdPartyTools.apiUrl')}</Label>
              <Input
                id="cli-api-url"
                value={activeCliSettings.apiUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) =>
                  updateCliSettings(activeCliTool, { apiUrl: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cli-api-key">{t('thirdPartyTools.apiKey')}</Label>
              <Input
                id="cli-api-key"
                type="password"
                value={activeCliSettings.apiKey}
                placeholder="••••••••"
                onChange={(event) =>
                  updateCliSettings(activeCliTool, { apiKey: event.target.value })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">{t('thirdPartyTools.forceCustomKey')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('thirdPartyTools.forceCustomKeyDesc')}
                </div>
              </div>
              <div className="origin-right scale-110">
                <Switch
                  checked={activeCliSettings.forceCustomApiKey}
                  onCheckedChange={(checked) =>
                    updateCliSettings(activeCliTool, { forceCustomApiKey: checked })
                  }
                  aria-label="Force cli api key"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCliDialogOpen(false)}>
              {t('thirdPartyTools.cancel')}
            </Button>
            <Button onClick={() => void handleSaveCliSettings()}>{t('thirdPartyTools.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
