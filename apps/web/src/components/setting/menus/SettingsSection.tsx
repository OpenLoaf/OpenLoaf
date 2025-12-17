"use client";

import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="relative py-2">
        <Separator />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 bg-background pr-3">
          <span className="text-xs font-medium text-muted-foreground">
            {title}
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

