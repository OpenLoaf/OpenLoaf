"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function SettingsGroup({
  title,
  action,
  children,
  showBorder,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  showBorder?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-medium">{title}</div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className={showBorder ? "rounded-lg border border-border p-3":""}>{children}</div>
    </section>
  );
}

