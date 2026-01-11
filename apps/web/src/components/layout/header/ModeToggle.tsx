"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggler } from "../../ThemeProvider";
import { Sun } from "@/components/animate-ui/icons/sun";
import { Moon } from "@/components/animate-ui/icons/moon";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { useBasicConfig } from "@/hooks/use-basic-config";

/** Toggle theme and persist the selection. */
export const ModeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { basic, setBasic } = useBasicConfig();
  const [iconTheme, setIconTheme] = useState<"light" | "dark">(
    (resolvedTheme ?? "light") as "light" | "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    /** Read theme from the root class list. */
    const readDomTheme = () =>
      root.classList.contains("dark") ? "dark" : "light";

    // 监听根节点类名变化，确保图标与真实主题一致。
    const observer = new MutationObserver(() => {
      setIconTheme(readDomTheme());
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    setIconTheme((resolvedTheme ?? readDomTheme()) as "light" | "dark");
    return () => observer.disconnect();
  }, [resolvedTheme]);

  return (
    <ThemeToggler
      theme={theme as any}
      resolvedTheme={resolvedTheme as any}
      setTheme={setTheme as any}
      direction="rtl"
    >
      {({ effective, resolved, toggleTheme }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const nextTheme = effective === "light" ? "dark" : "light";
                toggleTheme(nextTheme);
                // 同步主题选择到设置存储，便于下次启动恢复。
                if (basic.uiTheme === "system") {
                  // 保持系统自动切换开关不变，只更新手动偏好。
                  void setBasic({ uiThemeManual: nextTheme });
                  return;
                }
                void setBasic({ uiTheme: nextTheme, uiThemeManual: nextTheme });
              }}
            >
              {iconTheme === "light" ? (
                <AnimateIcon animateOnHover>
                  <Sun animation="path-loop" />
                </AnimateIcon>
              ) : (
                <AnimateIcon animateOnHover>
                  <Moon animation="balancing" />
                </AnimateIcon>
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            切换主题
          </TooltipContent>
        </Tooltip>
      )}
    </ThemeToggler>
  );
};
