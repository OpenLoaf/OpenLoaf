"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggler } from "@/components/layout/ThemeProvider";
import { Button } from "@/components/ui/button";

type FontSizeKey = "small" | "medium" | "large";
const FONT_SIZE_STORAGE_KEY = "teatime:font-size";
const CUSTOM_RULES_STORAGE_KEY = "teatime:custom-rules";

export function BasicSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const lastManualThemeRef = useRef<"dark" | "light">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  const [fontSize, setFontSize] = useState<FontSizeKey>("medium");
  const [savedCustomRules, setSavedCustomRules] = useState("");
  const [customRules, setCustomRules] = useState("");
  useEffect(() => {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (stored === "small" || stored === "medium" || stored === "large") {
      setFontSize(stored);
      return;
    }
    setFontSize("medium");
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(CUSTOM_RULES_STORAGE_KEY) ?? "";
    setSavedCustomRules(stored);
    setCustomRules(stored);
  }, []);

  useEffect(() => {
    const px =
      fontSize === "small" ? "14px" : fontSize === "medium" ? "16px" : "18px";
    document.documentElement.style.fontSize = px;
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
  }, [fontSize]);

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
      {({ effective, resolved, toggleTheme }) => {
        const isAutoTheme = effective === "system";
        const themeTabsValue = resolved;
        const isCustomRulesDirty = customRules !== savedCustomRules;

        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">主题</div>
                    <div className="text-xs text-muted-foreground">
                      选择淡色或浅色
                    </div>
                  </div>

                  <Tabs
                    value={themeTabsValue}
                    onValueChange={(next) => toggleTheme(next as any)}
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
                            return;
                          }
                          toggleTheme(lastManualThemeRef.current);
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
                      小 / 中 / 大
                    </div>
                  </div>

                  <Tabs
                    value={fontSize}
                    onValueChange={(next) => setFontSize(next as FontSizeKey)}
                    className="shrink-0"
                  >
                    <TabsList>
                      <TabsTrigger value="small">小</TabsTrigger>
                      <TabsTrigger value="medium">中</TabsTrigger>
                      <TabsTrigger value="large">大</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
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
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">用户自定义规则</div>
                    <div className="text-xs text-muted-foreground">
                      在这里填写你的个性化规则（支持多行）
                    </div>
                  </div>

                  {isCustomRulesDirty ? (
                    <div className="flex shrink-0 justify-end gap-2">
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
                          localStorage.setItem(
                            CUSTOM_RULES_STORAGE_KEY,
                            customRules,
                          );
                          setSavedCustomRules(customRules);
                        }}
                      >
                        保存
                      </Button>
                    </div>
                  ) : null}
                </div>

                <textarea
                  value={customRules}
                  onChange={(e) => {
                    setCustomRules(e.target.value);
                  }}
                  placeholder="例如：回答尽量简洁；优先给出可执行步骤；避免使用表情符号…"
                  className="min-h-32 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>
          </div>
        );
      }}
    </ThemeToggler>
  );
}
