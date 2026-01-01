"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TeatimeSettingsFieldProps = {
  children: ReactNode;
  className?: string;
};

/** Right-side field wrapper for settings rows. */
export function TeatimeSettingsField({ children, className }: TeatimeSettingsFieldProps) {
  return (
    <div
      className={cn("flex flex-none items-center justify-end ml-auto", className)}
    >
      {children}
    </div>
  );
}
