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

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@openloaf/ui/animate-ui/components/radix/switch";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import { ThemeToggler } from "@/components/ThemeProvider";
import { Button } from "@openloaf/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import {
  Bell,
  ChevronDown,
  Construction,
  Languages,
  Monitor,
  Palette,
  PanelBottomClose,
  Sparkles,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { clearThemeOverride, readThemeOverride } from "@/lib/theme-override";
import { SUPPORTED_UI_LANGUAGES } from "@/i18n/types";
import type { LanguageId } from "@/i18n/types";
import { detectSystemLanguage } from "@/i18n/detectLanguage";
import { isElectronEnv } from "@/utils/is-electron-env";
import LocalAccess from "./LocalAccess";
import { AboutOpenLoaf } from "./AboutOpenLoaf";
import { WebSearchSettings } from "./WebSearchSettings";

type FontSizeKey = "small" | "medium" | "large" | "xlarge";
type AnimationLevel = "low" | "medium" | "high";

function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

export function BasicSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { basic, setBasic, isLoading: basicLoading } = useBasicConfig();
  const { t } = useTranslation('settings');
  const isElectron = isElectronEnv();

  // Electron 专属：读取/写入"关闭时最小化到托盘"偏好（存储在 .settings.json）。
  const [minimizeToTray, setMinimizeToTrayState] = useState(false);
  useEffect(() => {
    if (!isElectron) return;
    window.openloafElectron?.getMinimizeToTray?.()
      .then((res) => { if (res?.ok) setMinimizeToTrayState(res.value) })
      .catch(() => {});
  }, [isElectron]);

  const lastManualThemeRef = useRef<"dark" | "light">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  const uiLanguageRaw = basic.uiLanguage;
  const fontSizeRaw = basic.uiFontSize;
  const animationLevelRaw = basic.uiAnimationLevel;
  const uiTheme = basic.uiTheme;
  const uiThemeManual = basic.uiThemeManual;
  // Empty = follow system; FOLLOW_SYSTEM_VALUE is the sentinel for the radio group
  const FOLLOW_SYSTEM_VALUE = '';
  const isFollowingSystem = !uiLanguageRaw || !SUPPORTED_UI_LANGUAGES.some(l => l.value === uiLanguageRaw);
  const uiLanguage: LanguageId | '' = isFollowingSystem ? FOLLOW_SYSTEM_VALUE : (uiLanguageRaw as LanguageId);
  // For display only: when following system, show the detected language label
  const systemLanguage = detectSystemLanguage();
  const systemLanguageLabel = SUPPORTED_UI_LANGUAGES.find(l => l.value === systemLanguage)?.label ?? systemLanguage;

  const fontSize: FontSizeKey =
    fontSizeRaw === "small" ||
    fontSizeRaw === "medium" ||
    fontSizeRaw === "large" ||
    fontSizeRaw === "xlarge"
      ? fontSizeRaw
      : "medium";
  // 逻辑：动画级别缺失时默认回退到高。
  const animationLevel: AnimationLevel =
    animationLevelRaw === "low" ||
    animationLevelRaw === "medium" ||
    animationLevelRaw === "high"
      ? animationLevelRaw
      : "high";

  useEffect(() => {
    const px =
      fontSize === "small"
        ? "14px"
        : fontSize === "medium"
          ? "16px"
          : fontSize === "large"
            ? "18px"
            : "20px";
    document.documentElement.style.fontSize = px;
  }, [fontSize]);

  useEffect(() => {
    if (basicLoading) return;
    if (uiTheme === "system") {
      // 逻辑：系统模式优先应用当日覆盖，跨日自动回到 system。
      const override = readThemeOverride();
      setTheme(override?.theme ?? "system");
      return;
    }
    if (uiTheme === "dark" || uiTheme === "light") {
      clearThemeOverride();
      setTheme(uiTheme);
    }
  }, [basicLoading, uiTheme, setTheme]);

  useEffect(() => {
    if (basicLoading) return;
    if (uiThemeManual === "dark" || uiThemeManual === "light") {
      lastManualThemeRef.current = uiThemeManual;
    }
  }, [basicLoading, uiThemeManual]);

  return (
    <ThemeToggler
      theme={(theme ?? "system") as any}
      resolvedTheme={(resolvedTheme ?? "light") as any}
      setTheme={setTheme as any}
      direction="rtl"
      onImmediateChange={(nextTheme) => {
        if (nextTheme === "dark" || nextTheme === "light") {
          lastManualThemeRef.current = nextTheme;
        }
      }}
    >
      {({ resolved, toggleTheme }) => {
        const isAutoTheme = uiTheme === "system";
        const themeTabsValue = resolved;
        const languageLabelById: Record<string, string> = {
          '': t('basicSettings.languageFollowSystem'),
          ...Object.fromEntries(SUPPORTED_UI_LANGUAGES.map(l => [l.value, l.label])),
        };

        return (
          <div className="space-y-6">
            <OpenLoafSettingsGroup title={t('basicSettings.systemConfig')}>
              <div className="divide-y divide-border/40">
                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={Languages} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.language')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.languageDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-w-[200px] w-auto justify-between font-normal"
                        >
                          <span className="truncate">
                            {isFollowingSystem
                              ? `${t('basicSettings.languageFollowSystem')} (${systemLanguageLabel})`
                              : languageLabelById[uiLanguage]}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[220px]">
                        <DropdownMenuRadioGroup
                          value={uiLanguage}
                          onValueChange={(next) => {
                            void setBasic({ uiLanguage: (next as LanguageId) || null });
                          }}
                        >
                          <DropdownMenuRadioItem value="">
                            {t('basicSettings.languageFollowSystem')}
                          </DropdownMenuRadioItem>
                          {SUPPORTED_UI_LANGUAGES.map(({ value, label }) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                              {label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={Palette} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.theme')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.themeDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={t('basicSettings.themeAutoSwitch')}
                        title={t('basicSettings.themeAutoSwitch')}
                        className={[
                          "flex h-8 shrink-0 items-center gap-1.5 rounded-3xl border px-2.5 text-xs font-medium transition-colors duration-150",
                          isAutoTheme
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-transparent text-muted-foreground hover:bg-accent",
                        ].join(" ")}
                        onClick={() => {
                          if (isAutoTheme) {
                            const nextManual = lastManualThemeRef.current;
                            toggleTheme(nextManual);
                            void setBasic({ uiTheme: nextManual, uiThemeManual: nextManual });
                          } else {
                            toggleTheme("system");
                            void setBasic({ uiTheme: "system" });
                          }
                        }}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        {t('basicSettings.themeFollowSystem')}
                      </button>
                      <Tabs
                        value={themeTabsValue}
                        onValueChange={(next) => {
                          const nextTheme = next as "dark" | "light";
                          lastManualThemeRef.current = nextTheme;
                          toggleTheme(nextTheme);
                          void setBasic({ uiTheme: nextTheme, uiThemeManual: nextTheme });
                        }}
                      >
                        <TabsList>
                          <TabsTrigger value="dark">{t('basicSettings.themeDark')}</TabsTrigger>
                          <TabsTrigger value="light">{t('basicSettings.themeLight')}</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={Type} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.fontSize')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.fontSizeDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <Tabs
                      value={fontSize}
                      onValueChange={(next) =>
                        void setBasic({ uiFontSize: next as FontSizeKey })
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="small">{t('basicSettings.fontSizeSmall')}</TabsTrigger>
                        <TabsTrigger value="medium">{t('basicSettings.fontSizeMedium')}</TabsTrigger>
                        <TabsTrigger value="large">{t('basicSettings.fontSizeLarge')}</TabsTrigger>
                        <TabsTrigger value="xlarge">{t('basicSettings.fontSizeXLarge')}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={PanelBottomClose} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.projectOpenMode')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.projectOpenModeDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-72 shrink-0 justify-end">
                    <div className="flex flex-col items-end gap-2">
                      <Tabs
                        value={basic.projectOpenMode}
                        onValueChange={(next) =>
                          void setBasic({ projectOpenMode: next as "sidebar" | "window" })
                        }
                      >
                        <TabsList>
                          <TabsTrigger value="sidebar">
                            {t('basicSettings.projectOpenModeSidebar')}
                          </TabsTrigger>
                          <TabsTrigger value="window" disabled={!isElectron}>
                            {t('basicSettings.projectOpenModeWindow')}
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {!isElectron ? (
                        <div className="text-xs text-muted-foreground">
                          {t('basicSettings.projectOpenModeWindowElectronOnly')}
                        </div>
                      ) : null}
                    </div>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={Sparkles} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.animationLevel')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.animationLevelDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <Tabs
                      value={animationLevel}
                      onValueChange={(next) =>
                        void setBasic({ uiAnimationLevel: next as AnimationLevel })
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="low">{t('basicSettings.animationLow')}</TabsTrigger>
                        <TabsTrigger value="medium">{t('basicSettings.animationMedium')}</TabsTrigger>
                        <TabsTrigger value="high">{t('basicSettings.animationHigh')}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={Bell} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.notificationSound')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.notificationSoundDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={basic.appNotificationSoundEnabled}
                        onCheckedChange={(checked) =>
                          void setBasic({ appNotificationSoundEnabled: checked })
                        }
                        aria-label="Notification sound"
                      />
                    </div>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-center gap-2 py-3">
                  <SettingIcon icon={Construction} bg="bg-secondary" fg="text-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t('basicSettings.showDevNotice')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('basicSettings.showDevNoticeDesc')}
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={basic.showDevNoticeDialog}
                        onCheckedChange={(checked) =>
                          void setBasic({ showDevNoticeDialog: checked })
                        }
                        aria-label="Show dev notice dialog"
                      />
                    </div>
                  </OpenLoafSettingsField>
                </div>

                {isElectron && (
                  <div className="flex flex-wrap items-center gap-2 py-3">
                    <SettingIcon icon={PanelBottomClose} bg="bg-secondary" fg="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t('basicSettings.minimizeToTray')}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('basicSettings.minimizeToTrayDesc')}
                      </div>
                    </div>

                    <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                      <div className="origin-right scale-125">
                        <Switch
                          checked={minimizeToTray}
                          onCheckedChange={(checked) => {
                            setMinimizeToTrayState(checked);
                            window.openloafElectron?.setMinimizeToTray?.(checked)?.catch(() => {});
                          }}
                          aria-label="Minimize to tray"
                        />
                      </div>
                    </OpenLoafSettingsField>
                  </div>
                )}

                <LocalAccess />

              </div>
            </OpenLoafSettingsGroup>

            <WebSearchSettings />

            <AboutOpenLoaf />

          </div>
        );
      }}
    </ThemeToggler>
  );
}
