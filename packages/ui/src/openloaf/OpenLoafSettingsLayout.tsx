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

import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OpenLoafSettingsLayoutProps = {
  menu: ReactNode;
  content: ReactNode;
  isCollapsed?: boolean;
  menuWidth?: number;
  collapsedMenuWidth?: number;
  className?: string;
  sectionClassName?: string;
  menuClassName?: string;
  contentWrapperClassName?: string;
  contentInnerClassName?: string;
};

/** Settings page layout with menu and content regions. */
export const OpenLoafSettingsLayout = forwardRef<HTMLDivElement, OpenLoafSettingsLayoutProps>(
  (
    {
      menu,
      content,
      isCollapsed = false,
      menuWidth = 192,
      collapsedMenuWidth = 60,
      className,
      sectionClassName,
      menuClassName,
      contentWrapperClassName,
      contentInnerClassName,
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn("h-full w-full min-h-0 min-w-0 overflow-hidden", className)}
    >
      <section
        className={cn(
          "relative flex h-full min-h-0 flex-col overflow-hidden",
          sectionClassName,
        )}
      >
        <div className="flex h-full min-h-0">
          <aside
            className={cn("shrink-0 border-r border-border", menuClassName)}
            style={{ width: isCollapsed ? collapsedMenuWidth : menuWidth }}
          >
            {menu}
          </aside>
          <div
            className={cn("flex-1 min-w-0 min-h-0 overflow-auto", contentWrapperClassName)}
          >
            <div className={cn("h-full min-h-0 pl-3 pr-1 pt-2", contentInnerClassName)}>
              {content}
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
);

OpenLoafSettingsLayout.displayName = "OpenLoafSettingsLayout";
