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

export type OpenLoafSettingsFieldProps = {
  children: ReactNode;
  className?: string;
};

/** Right-side field wrapper for settings rows. */
export function OpenLoafSettingsField({ children, className }: OpenLoafSettingsFieldProps) {
  return (
    <div
      className={cn("flex flex-none items-center justify-end ml-auto", className)}
    >
      {children}
    </div>
  );
}
