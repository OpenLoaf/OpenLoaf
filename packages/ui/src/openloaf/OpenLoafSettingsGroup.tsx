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

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OpenLoafSettingsCard, type OpenLoafSettingsCardProps } from "./OpenLoafSettingsCard";

export type OpenLoafSettingsGroupProps = {
  title: string;
  /** Optional header icon. */
  icon?: ReactNode;
  /** Optional subtitle content. */
  subtitle?: ReactNode;
  /** Optional class name for subtitle wrapper. */
  subtitleClassName?: string;
  action?: ReactNode;
  children: ReactNode;
  showBorder?: boolean;
  cardProps?: Omit<OpenLoafSettingsCardProps, "children">;
  className?: string;
};

/** Settings group with header, optional actions, and card wrapper. */
export function OpenLoafSettingsGroup({
  title,
  icon,
  subtitle,
  subtitleClassName,
  action,
  children,
  showBorder = true,
  cardProps,
  className,
}: OpenLoafSettingsGroupProps) {
  // 逻辑：文本副标题沿用默认样式，组件副标题自定义样式。
  const isSubtitleText = typeof subtitle === "string";

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {icon ? (
              <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                {icon}
              </span>
            ) : null}
            <span>{title}</span>
          </div>
          {subtitle ? (
            <div
              className={cn(
                isSubtitleText && "text-xs text-muted-foreground",
                subtitleClassName
              )}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {showBorder ? (
        <OpenLoafSettingsCard {...cardProps}>{children}</OpenLoafSettingsCard>
      ) : (
        children
      )}
    </section>
  );
}
