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
      className={cn(
        "flex w-full items-center sm:w-auto sm:min-w-[200px] sm:ml-auto sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}
