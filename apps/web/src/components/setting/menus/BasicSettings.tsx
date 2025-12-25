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
import { Input } from "@/components/ui/input";
import { SettingsGroup } from "./SettingsGroup";
import { ChevronDown } from "lucide-react";
import { useSetting } from "@/hooks/use-settings";
import { WebSettingDefs } from "@/lib/setting-defs";

type FontSizeKey = "small" | "medium" | "large" | "xlarge";
type LanguageId = "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "fr-FR" | "de-DE" | "es-ES";

export function BasicSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const lastManualThemeRef = useRef<"dark" | "light">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  const { value: uiLanguageRaw, setValue: setUiLanguage } = useSetting(
    WebSettingDefs.UiLanguage,
  );
  const { value: fontSizeRaw, setValue: setFontSize } = useSetting(
    WebSettingDefs.UiFontSize,
  );
  const { value: localStorageDirRaw, setValue: setLocalStorageDir } = useSetting(
    WebSettingDefs.AppLocalStorageDir,
  );
  const { value: autoBackupDirRaw, setValue: setAutoBackupDir } = useSetting(
    WebSettingDefs.AppAutoBackupDir,
  );
  const {
    value: savedCustomRulesValue,
    setValue: setSavedCustomRulesValue,
    loaded: customRulesLoaded,
  } = useSetting(WebSettingDefs.AppCustomRules);
  const { value: uiTheme, setValue: setUiTheme, loaded: themeLoaded } = useSetting(
    WebSettingDefs.UiTheme,
  );
  const {
    value: uiThemeManual,
    setValue: setUiThemeManual,
    loaded: themeManualLoaded,
  } = useSetting(WebSettingDefs.UiThemeManual);

  const [savedCustomRules, setSavedCustomRules] = useState("");
  const [customRules, setCustomRules] = useState("");

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
  const localStorageDir =
    typeof localStorageDirRaw === "string" ? localStorageDirRaw : "";
  const autoBackupDir =
    typeof autoBackupDirRaw === "string" ? autoBackupDirRaw : "";

  useEffect(() => {
    if (!customRulesLoaded) return;
    const next = typeof savedCustomRulesValue === "string" ? savedCustomRulesValue : "";
    setSavedCustomRules(next);
    setCustomRules(next);
  }, [customRulesLoaded, savedCustomRulesValue]);

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
    if (!themeLoaded) return;
    if (uiTheme === "dark" || uiTheme === "light" || uiTheme === "system") {
      setTheme(uiTheme);
    }
  }, [themeLoaded, uiTheme, setTheme]);

  useEffect(() => {
    if (!themeManualLoaded) return;
    if (uiThemeManual === "dark" || uiThemeManual === "light") {
      lastManualThemeRef.current = uiThemeManual;
    }
  }, [themeManualLoaded, uiThemeManual]);

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
            <SettingsGroup title="系统配置">
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">语言</div>
                    <div className="text-xs text-muted-foreground">
                      暂不支持切换，仅保存偏好
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-[200px] justify-between font-normal"
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
                        onValueChange={(next) => void setUiLanguage(next as LanguageId)}
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
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">主题</div>
                    <div className="text-xs text-muted-foreground">
                      选择淡色或浅色
                    </div>
                  </div>

                  <Tabs
                    value={themeTabsValue}
                    onValueChange={(next) => {
                      const nextTheme = next as "dark" | "light";
                      lastManualThemeRef.current = nextTheme;
                      toggleTheme(nextTheme);
                      void setUiTheme(nextTheme);
                      void setUiThemeManual(nextTheme);
                    }}
                    className="shrink-0"
                  >
                    <TabsList>
                      <TabsTrigger value="dark">淡色</TabsTrigger>
                      <TabsTrigger value="light">浅色</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">主题系统自动切换</div>
                    <div className="text-xs text-muted-foreground">
                      跟随系统浅色/淡色
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="origin-right scale-125">
                      <Switch
                        checked={isAutoTheme}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            toggleTheme("system");
                            void setUiTheme("system");
                            return;
                          }
                          const nextManual = lastManualThemeRef.current;
                          toggleTheme(nextManual);
                          void setUiTheme(nextManual);
                          void setUiThemeManual(nextManual);
                        }}
                        aria-label="Auto theme"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">字体大小</div>
                    <div className="text-xs text-muted-foreground">
                      小 / 中 / 大 / 特大
                    </div>
                  </div>

                  <Tabs
                    value={fontSize}
                    onValueChange={(next) => void setFontSize(next as FontSizeKey)}
                    className="shrink-0"
                  >
                    <TabsList>
                      <TabsTrigger value="small">小</TabsTrigger>
                      <TabsTrigger value="medium">中</TabsTrigger>
                      <TabsTrigger value="large">大</TabsTrigger>
                      <TabsTrigger value="xlarge">特大</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </SettingsGroup>

            <SettingsGroup title="本地存储">
              <div className="divide-y divide-border">
                <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:w-56">
                    <div className="text-sm font-medium">本地文件存储路径</div>
                    <div className="text-xs text-muted-foreground">
                      用于保存导出文件等本地内容
                    </div>
                  </div>

                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={localStorageDir}
                      readOnly
                      placeholder="未选择"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        pickDirectory({
                          currentValue: localStorageDir,
                          setValue: setLocalStorageDir,
                          promptLabel: "请输入本地文件存储路径",
                        })
                      }
                    >
                      选择
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:w-56">
                    <div className="text-sm font-medium">自动备份文件夹路径</div>
                    <div className="text-xs text-muted-foreground">
                      备份文件的保存位置
                    </div>
                  </div>

                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={autoBackupDir}
                      readOnly
                      placeholder="未选择"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        pickDirectory({
                          currentValue: autoBackupDir,
                          setValue: setAutoBackupDir,
                          promptLabel: "请输入自动备份文件夹路径",
                        })
                      }
                    >
                      选择
                    </Button>
                  </div>
                </div>
              </div>
            </SettingsGroup>

            <SettingsGroup
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
                        void setSavedCustomRulesValue(customRules);
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
            </SettingsGroup>

            <SettingsGroup title="工具">
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">界面重新加载</div>
                  <div className="text-xs text-muted-foreground">
                    刷新整个页面
                  </div>
                </div>

                <div className="flex items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    刷新
                  </Button>
                </div>
              </div>
            </SettingsGroup>
          </div>
        );
      }}
    </ThemeToggler>
  );
}
