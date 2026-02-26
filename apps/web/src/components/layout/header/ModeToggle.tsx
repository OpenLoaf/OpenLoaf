/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { AnimatedThemeToggle } from "@openloaf/ui/animated-theme-toggle";

/** Toggle theme and persist the selection. */
export const ModeToggle = () => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AnimatedThemeToggle
          className="h-8 w-8 rounded-full px-0 text-[#1a73e8] hover:bg-[#e8f0fe] hover:text-[#1765cc] dark:text-sky-300 dark:hover:bg-[hsl(var(--muted)/0.46)] dark:hover:text-sky-200"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        切换主题
      </TooltipContent>
    </Tooltip>
  );
};
