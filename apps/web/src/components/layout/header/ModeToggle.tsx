"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ThemeToggler } from "../ThemeProvider";
import { Sun } from "@/components/animate-ui/icons/sun";
import { Moon } from "@/components/animate-ui/icons/moon";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

export const ModeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <ThemeToggler
      theme={theme as any}
      resolvedTheme={resolvedTheme as any}
      setTheme={setTheme as any}
      direction="rtl"
    >
      {({ effective, toggleTheme }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            toggleTheme(effective === "light" ? "dark" : "light");
          }}
        >
          {effective === "light" ? (
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
