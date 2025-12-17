"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggler } from "@/components/layout/ThemeProvider";
import { Button } from "@/components/ui/button";

type FontSizeKey = "small" | "medium" | "large";
const FONT_SIZE_STORAGE_KEY = "teatime:font-size";

export function BasicSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const lastManualThemeRef = useRef<"dark" | "light">(
    resolvedTheme === "dark" ? "dark" : "light",
  );

  const [fontSize, setFontSize] = useState<FontSizeKey>("medium");
  useEffect(() => {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (stored === "small" || stored === "medium" || stored === "large") {
      setFontSize(stored);
      return;
    }
    setFontSize("medium");
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
          </div>
        );
      }}
    </ThemeToggler>
  );
}
