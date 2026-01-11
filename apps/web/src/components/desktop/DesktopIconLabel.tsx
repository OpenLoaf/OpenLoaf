"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DesktopIconLabelProps {
  children: React.ReactNode;
  className?: string;
}

/** Render the icon title label with consistent truncation styles. */
export default function DesktopIconLabel({ children, className }: DesktopIconLabelProps) {
  return (
    <div
      className={cn(
        // 说明：truncate 会带 overflow-hidden，line-height 过小会导致文字被裁切，这里给足行高。
        "w-full truncate text-center text-[11px] leading-[14px] text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
