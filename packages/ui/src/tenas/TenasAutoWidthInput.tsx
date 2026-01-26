"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@tenas-ai/ui/input";

export type TenasAutoWidthInputProps = ComponentProps<typeof Input> & {
  minChars?: number;
  maxChars?: number;
};

/** Auto width input based on content length. */
export function TenasAutoWidthInput({
  minChars = 12,
  maxChars = 42,
  value,
  placeholder,
  className,
  style,
  ...props
}: TenasAutoWidthInputProps) {
  const valueText = value == null ? "" : String(value);
  const placeholderText = typeof placeholder === "string" ? placeholder : "";
  const baseLength = Math.max(valueText.length, placeholderText.length, minChars);
  const clampedLength = Math.min(baseLength, maxChars);
  // 中文注释：按字符数估算输入框宽度，超出时由 max 限制。
  const widthStyle = { width: `${clampedLength}ch`, ...style };

  return (
    <Input
      {...props}
      value={value}
      placeholder={placeholder}
      className={cn("min-w-[160px] max-w-[420px]", className)}
      style={widthStyle}
    />
  );
}
