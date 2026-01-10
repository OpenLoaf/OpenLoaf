"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TeatimeSettingsCard, type TeatimeSettingsCardProps } from "./TeatimeSettingsCard";

export type TeatimeSettingsGroupProps = {
  title: string;
  /** Optional header icon. */
  icon?: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  showBorder?: boolean;
  cardProps?: Omit<TeatimeSettingsCardProps, "children">;
  className?: string;
};

/** Settings group with header, optional actions, and card wrapper. */
export function TeatimeSettingsGroup({
  title,
  icon,
  subtitle,
  action,
  children,
  showBorder = true,
  cardProps,
  className,
}: TeatimeSettingsGroupProps) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {icon ? (
              <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                {icon}
              </span>
            ) : null}
            <span>{title}</span>
          </div>
          {subtitle ? (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {showBorder ? (
        <TeatimeSettingsCard {...cardProps}>{children}</TeatimeSettingsCard>
      ) : (
        children
      )}
    </section>
  );
}
