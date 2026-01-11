"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TenasSettingsFieldProps = {
  children: ReactNode;
  className?: string;
};

/** Right-side field wrapper for settings rows. */
export function TenasSettingsField({ children, className }: TenasSettingsFieldProps) {
  return (
    <div
      className={cn("flex flex-none items-center justify-end ml-auto", className)}
    >
      {children}
    </div>
  );
}
