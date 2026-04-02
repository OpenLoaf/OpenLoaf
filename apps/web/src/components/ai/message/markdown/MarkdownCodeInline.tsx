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

import * as React from "react";
import { cn } from "@/lib/utils";

export default React.memo(function MarkdownCodeInline({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: unknown;
  'data-block'?: boolean | string;
} & Record<string, unknown>) {
  const isBlock = props['data-block'] === true || props['data-block'] === 'true';

  if (isBlock) {
    return (
      <pre
        className={cn(
          "overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.9em] text-foreground",
          className,
        )}
      >
        <code {...(props as any)}>{children as any}</code>
      </pre>
    );
  }

  return (
    <code
      className={cn(
        "rounded-3xl bg-muted px-2 py-1 font-mono text-[0.9em] font-normal text-foreground wrap-break-word",
        className
      )}
      {...(props as any)}
    >
      {children as any}
    </code>
  );
});
