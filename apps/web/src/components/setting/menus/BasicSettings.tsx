/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
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
import { ChevronDown } from "lucide-react";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { clearThemeOverride, readThemeOverride } from "@/lib/theme-override";
import LocalAccess from "./LocalAccess";

type FontSizeKey = "small" | "medium" | "large" | "xlarge";
type AnimationLevel = "low" | "medium" | "high";
type LanguageId = "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "fr-FR" | "de-DE" | "es-ES";

export function BasicSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { basic, setBasic, isLoading: basicLoading } = useBasicConfig();

  const lastManualThemeRef = useRef<"dark" | "light">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  const uiLanguageRaw = basic.uiLanguage;
  const fontSizeRaw = basic.uiFontSize;
  const animationLevelRaw = basic.uiAnimationLevel;
  const uiTheme = basic.uiTheme;
  const uiThemeManual = basic.uiThemeManual;
  const toolAllowOutsideScope = Boolean(basic.toolAllowOutsideScope);

  const uiLanguage: LanguageId =
    uiLanguageRaw === "zh-CN" ||
    uiLanguageRaw === "en-US" ||
    uiLanguageRaw === "ja-JP" ||
    uiLanguageRaw === "ko-KR" ||
    uiLanguageRaw === "fr-FR" ||
    uiLanguageRaw === "de-DE" ||
    uiLanguageRaw === "es-ES"
      ? uiLanguageRaw
      : "zh-CN";

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
        const languageLabelById: Record<LanguageId, string> = {
          "zh-CN": "中文（简体）",
          "en-US": "English",
          "ja-JP": "日本語",
          "ko-KR": "한국어",
          "fr-FR": "Français",
          "de-DE": "Deutsch",
          "es-ES": "Español",
        };

        return (
          <div className="space-y-6">
            <OpenLoafSettingsGroup title="系统配置">
              <div className="divide-y divide-border">
                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">语言</div>
                    <div className="text-xs text-muted-foreground">
                      暂不支持切换，仅保存偏好
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
                            {languageLabelById[uiLanguage]}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[220px]">
                          <DropdownMenuRadioGroup
                            value={uiLanguage}
                            onValueChange={(next) =>
                              void setBasic({ uiLanguage: next as LanguageId })
                            }
                          >
                          {Object.entries(languageLabelById).map(
                            ([id, label]) => (
                              <DropdownMenuRadioItem key={id} value={id}>
                                {label}
                              </DropdownMenuRadioItem>
                            ),
                          )}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">主题</div>
                    <div className="text-xs text-muted-foreground">
                      选择淡色或浅色
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
                        <TabsTrigger value="dark">黑夜</TabsTrigger>
                        <TabsTrigger value="light">白天</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">主题系统自动切换</div>
                    <div className="text-xs text-muted-foreground">
                      跟随系统浅色/淡色
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={isAutoTheme}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            toggleTheme("system");
                            void setBasic({ uiTheme: "system" });
                            return;
                          }
                          const nextManual = lastManualThemeRef.current;
                          toggleTheme(nextManual);
                          void setBasic({ uiTheme: nextManual, uiThemeManual: nextManual });
                        }}
                        aria-label="Auto theme"
                      />
                    </div>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">字体大小</div>
                    <div className="text-xs text-muted-foreground">
                      小 / 中 / 大 / 特大
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
                        <TabsTrigger value="small">小</TabsTrigger>
                        <TabsTrigger value="medium">中</TabsTrigger>
                        <TabsTrigger value="large">大</TabsTrigger>
                        <TabsTrigger value="xlarge">特大</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">动画级别</div>
                    <div className="text-xs text-muted-foreground">
                      降低动画将节省系统资源
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
                        <TabsTrigger value="low">低</TabsTrigger>
                        <TabsTrigger value="medium">中</TabsTrigger>
                        <TabsTrigger value="high">高</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </OpenLoafSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">通知声音提示</div>
                    <div className="text-xs text-muted-foreground">
                      语音输入开始时播放提示音
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

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">允许工具访问工作区外路径</div>
                    <div className="text-xs text-muted-foreground">
                      关闭时仅允许在 project / workspace 根目录内访问
                    </div>
                  </div>

                  <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={toolAllowOutsideScope}
                        onCheckedChange={(checked) =>
                          void setBasic({ toolAllowOutsideScope: checked })
                        }
                        aria-label="Allow tool outside scope"
                      />
                    </div>
                  </OpenLoafSettingsField>
                </div>
              </div>
            </OpenLoafSettingsGroup>

            <LocalAccess />

          </div>
        );
      }}
    </ThemeToggler>
  );
}
