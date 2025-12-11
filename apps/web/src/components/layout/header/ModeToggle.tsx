"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export const ModeToggle = () => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  };

  const getCurrentIcon = () => {
    if (theme === "light") {
      return <Sun className="h-[1.2rem] w-[1.2rem] transition-all" />;
    } else if (theme === "dark") {
      return <Moon className="h-[1.2rem] w-[1.2rem] transition-all" />;
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {getCurrentIcon()}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
};
