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

import type { ReactNode } from "react";

type StepUpStepShellProps = {
  /** Step title shown in the header. */
  title: string;
  /** Optional subtitle shown under the title. */
  subtitle?: string;
  /** Main content area for the step. */
  children: ReactNode;
  /** Optional footer slot rendered at the bottom. */
  footer?: ReactNode;
};

/** Render a stable step layout with fixed header placement. */
export function StepUpStepShell({ title, subtitle, children, footer }: StepUpStepShellProps) {
  return (
    <div className="grid min-h-[380px] grid-rows-[96px_1fr_auto] gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-center">
        <div className="text-3xl font-semibold">{title}</div>
        {subtitle ? (
          <div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      <div>{children}</div>
      {footer ? <div className="flex justify-center">{footer}</div> : null}
    </div>
  );
}
