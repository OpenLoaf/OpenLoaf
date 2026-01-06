"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ThemeToggler } from "../../ThemeProvider";
import { Sun } from "@/components/animate-ui/icons/sun";
import { Moon } from "@/components/animate-ui/icons/moon";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { useBasicConfig } from "@/hooks/use-basic-config";

/** Toggle theme and persist the selection. */
export const ModeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { basic, setBasic } = useBasicConfig();

  return (
    <ThemeToggler
      theme={theme as any}
      resolvedTheme={resolvedTheme as any}
      setTheme={setTheme as any}
      direction="rtl"
    >
      {({ effective, resolved, toggleTheme }) => (
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
          {resolved === "light" ? (
            <AnimateIcon animateOnHover >
              <Sun animation="path-loop"/>
            </AnimateIcon>
          ) : (
            <AnimateIcon animateOnHover >
              <Moon animation="balancing"/>
            </AnimateIcon>
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      )}
    </ThemeToggler>
  );
};
