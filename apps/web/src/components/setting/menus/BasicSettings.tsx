"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggler } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TenasAutoWidthInput } from "@/components/ui/tenas/TenasAutoWidthInput";
import { TenasSettingsGroup } from "@/components/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@/components/ui/tenas/TenasSettingsField";
import { ChevronDown } from "lucide-react";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { clearThemeOverride, readThemeOverride } from "@/lib/theme-override";

type FontSizeKey = "small" | "medium" | "large" | "xlarge";
type AnimationLevel = "low" | "medium" | "high";
type LanguageId = "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "fr-FR" | "de-DE" | "es-ES";
type OfficeOpenMode = "wps" | "office";

export function BasicSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { basic, setBasic, isLoading: basicLoading } = useBasicConfig();

  const lastManualThemeRef = useRef<"dark" | "light">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  const uiLanguageRaw = basic.uiLanguage;
  const fontSizeRaw = basic.uiFontSize;
  const animationLevelRaw = basic.uiAnimationLevel;
  const localStorageDirRaw = basic.appLocalStorageDir;
  const autoBackupDirRaw = basic.appAutoBackupDir;
  const savedCustomRulesValue = basic.appCustomRules;
  const uiTheme = basic.uiTheme;
  const uiThemeManual = basic.uiThemeManual;
  const toolAllowOutsideScope = Boolean(basic.toolAllowOutsideScope);
  const officeOpenModeRaw = basic.appOfficeOpenMode;

  const [savedCustomRules, setSavedCustomRules] = useState("");
  const [customRules, setCustomRules] = useState("");
  const [officeAvailability, setOfficeAvailability] = useState<{
    wps: boolean;
    office: boolean;
  } | null>(null);

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
  const localStorageDir =
    typeof localStorageDirRaw === "string" ? localStorageDirRaw : "";
  const autoBackupDir =
    typeof autoBackupDirRaw === "string" ? autoBackupDirRaw : "";
  const officeOpenMode: OfficeOpenMode =
    officeOpenModeRaw === "office" || officeOpenModeRaw === "wps"
      ? officeOpenModeRaw
      : "wps";

  useEffect(() => {
    if (basicLoading) return;
    const next = typeof savedCustomRulesValue === "string" ? savedCustomRulesValue : "";
    setSavedCustomRules(next);
    setCustomRules(next);
  }, [basicLoading, savedCustomRulesValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.tenasElectron?.getOfficeInstallations) return;
    let cancelled = false;
    window.tenasElectron
      .getOfficeInstallations()
      .then((res) => {
        if (cancelled) return;
        setOfficeAvailability(res);
      })
      .catch(() => {
        if (cancelled) return;
        setOfficeAvailability({ wps: false, office: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wpsAvailable = officeAvailability?.wps ?? true;
  const officeAvailable = officeAvailability?.office ?? true;

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
        const isCustomRulesDirty = customRules !== savedCustomRules;
        const languageLabelById: Record<LanguageId, string> = {
          "zh-CN": "中文（简体）",
          "en-US": "English",
          "ja-JP": "日本語",
          "ko-KR": "한국어",
          "fr-FR": "Français",
          "de-DE": "Deutsch",
          "es-ES": "Español",
        };

        /** Pick a directory or prompt for manual input. */
        const pickDirectory = async ({
          currentValue,
          setValue,
          promptLabel,
        }: {
          currentValue: string;
          setValue: (value: string) => void | Promise<void>;
          promptLabel: string;
        }) => {
          const showDirectoryPicker = (window as any)
            .showDirectoryPicker as undefined | (() => Promise<any>);

          if (typeof showDirectoryPicker === "function") {
            try {
              const handle = await showDirectoryPicker();
              const next = String(handle?.name ?? "");
              setValue(next);
              return;
            } catch {
              return;
            }
          }

          const manual = window.prompt(promptLabel, currentValue);
          if (manual === null) return;
          setValue(manual);
        };

        return (
          <div className="space-y-6">
            <TenasSettingsGroup title="系统配置">
              <div className="divide-y divide-border">
                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">语言</div>
                    <div className="text-xs text-muted-foreground">
                      暂不支持切换，仅保存偏好
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">主题</div>
                    <div className="text-xs text-muted-foreground">
                      选择淡色或浅色
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
                        <TabsTrigger value="dark">淡色</TabsTrigger>
                        <TabsTrigger value="light">浅色</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">文档打开方式</div>
                    <div className="text-xs text-muted-foreground">
                      双击 Office 文件时使用的应用
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <Tabs
                      value={officeOpenMode}
                      onValueChange={(next) =>
                        void setBasic({ appOfficeOpenMode: next as OfficeOpenMode })
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="wps" disabled={!wpsAvailable}>
                          WPS
                        </TabsTrigger>
                        <TabsTrigger value="office" disabled={!officeAvailable}>
                          Microsoft Office
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">主题系统自动切换</div>
                    <div className="text-xs text-muted-foreground">
                      跟随系统浅色/淡色
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">字体大小</div>
                    <div className="text-xs text-muted-foreground">
                      小 / 中 / 大 / 特大
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">动画级别</div>
                    <div className="text-xs text-muted-foreground">
                      降低动画将节省系统资源
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">通知声音提示</div>
                    <div className="text-xs text-muted-foreground">
                      语音输入开始时播放提示音
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={basic.appNotificationSoundEnabled}
                        onCheckedChange={(checked) =>
                          void setBasic({ appNotificationSoundEnabled: checked })
                        }
                        aria-label="Notification sound"
                      />
                    </div>
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">允许工具访问工作区外路径</div>
                    <div className="text-xs text-muted-foreground">
                      关闭时仅允许在 project / workspace 根目录内访问
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={toolAllowOutsideScope}
                        onCheckedChange={(checked) =>
                          void setBasic({ toolAllowOutsideScope: checked })
                        }
                        aria-label="Allow tool outside scope"
                      />
                    </div>
                  </TenasSettingsField>
                </div>
              </div>
            </TenasSettingsGroup>

            <TenasSettingsGroup title="本地存储">
              <div className="divide-y divide-border">
                <div className="flex flex-wrap items-start gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">本地文件存储路径</div>
                    <div className="text-xs text-muted-foreground">
                      用于保存导出文件等本地内容
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-[480px] shrink-0 justify-end gap-2">
                    <TenasAutoWidthInput
                      value={localStorageDir}
                      readOnly
                      placeholder="未选择"
                      className="bg-background"
                      minChars={16}
                      maxChars={48}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        pickDirectory({
                          currentValue: localStorageDir,
                          setValue: (next) => setBasic({ appLocalStorageDir: next }),
                          promptLabel: "请输入本地文件存储路径",
                        })
                      }
                    >
                      选择
                    </Button>
                  </TenasSettingsField>
                </div>

                <div className="flex flex-wrap items-start gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">自动备份文件夹路径</div>
                    <div className="text-xs text-muted-foreground">
                      备份文件的保存位置
                    </div>
                  </div>

                  <TenasSettingsField className="w-full sm:w-[480px] shrink-0 justify-end gap-2">
                    <TenasAutoWidthInput
                      value={autoBackupDir}
                      readOnly
                      placeholder="未选择"
                      className="bg-background"
                      minChars={16}
                      maxChars={48}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        pickDirectory({
                          currentValue: autoBackupDir,
                          setValue: (next) => setBasic({ appAutoBackupDir: next }),
                          promptLabel: "请输入自动备份文件夹路径",
                        })
                      }
                    >
                      选择
                    </Button>
                  </TenasSettingsField>
                </div>
              </div>
            </TenasSettingsGroup>

            <TenasSettingsGroup
              title="全局自定义规则"
              action={
                isCustomRulesDirty ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomRules(savedCustomRules)}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        void setBasic({ appCustomRules: customRules });
                        setSavedCustomRules(customRules);
                      }}
                    >
                      保存
                    </Button>
                  </div>
                ) : null
              }
            >
              <div className="divide-y divide-border">
                <div className="py-3 text-xs text-muted-foreground">
                  所有 AI agent 都会使用这些规则（例如：你的名字、偏好、项目分类方式等）
                </div>
                <div className="py-3">
                  <div className="relative rounded-xl bg-background shadow-xs transition-all duration-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 border border-border/50">
                    <textarea
                      value={customRules}
                      onChange={(e) => {
                        setCustomRules(e.target.value);
                      }}
                      placeholder="例如：我叫XXX；我喜欢YYY；项目按 A/B/C 分类；回答尽量简洁并给出可执行步骤…"
                      className="h-48 w-full resize-none overflow-y-auto border-none bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              </div>
            </TenasSettingsGroup>

          </div>
        );
      }}
    </ThemeToggler>
  );
}
