/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { AnimatedThemeToggle } from "@openloaf/ui/animated-theme-toggle";

/** Toggle theme and persist the selection. */
export const ModeToggle = () => {
  const { t } = useTranslation('nav');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AnimatedThemeToggle
          className="h-8 w-8 rounded-full px-0 text-ol-blue hover:bg-ol-blue-bg hover:text-ol-blue"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {t('header.toggleTheme')}
      </TooltipContent>
    </Tooltip>
  );
};
