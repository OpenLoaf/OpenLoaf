"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { AnimatedThemeToggle } from "@tenas-ai/ui/animated-theme-toggle";

/** Toggle theme and persist the selection. */
export const ModeToggle = () => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AnimatedThemeToggle
          className="h-8 w-8 rounded-full px-0 text-[#f9ab00] hover:bg-[hsl(var(--muted)/0.58)] hover:text-[#f4b400] dark:text-sky-300 dark:hover:bg-[hsl(var(--muted)/0.46)] dark:hover:text-sky-200"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        切换主题
      </TooltipContent>
    </Tooltip>
  );
};
