"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

/** Toggle theme and persist the selection. */
export const ModeToggle = () => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AnimatedThemeToggle />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        切换主题
      </TooltipContent>
    </Tooltip>
  );
};
