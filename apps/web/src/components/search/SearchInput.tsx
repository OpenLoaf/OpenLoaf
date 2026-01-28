"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchInputProps = {
  /** 当前搜索文本。 */
  value: string;
  /** 更新搜索文本。 */
  onValueChange: (value: string) => void;
  /** 输入框占位提示。 */
  placeholder?: string;
  /** 当前项目名称。 */
  projectTitle?: string | null;
  /** 清空项目范围。 */
  onClearProject?: () => void;
  /** 输入法合成开始回调。 */
  onCompositionStart?: (event: React.CompositionEvent<HTMLInputElement>) => void;
  /** 输入法合成结束回调。 */
  onCompositionEnd?: (event: React.CompositionEvent<HTMLInputElement>) => void;
};

/** Search 输入框：显示项目范围与分隔符。 */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  projectTitle,
  onClearProject,
  onCompositionStart,
  onCompositionEnd,
}: SearchInputProps) {
  const hasProject = Boolean(projectTitle);
  const shouldHandleClear = hasProject && !value;

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!shouldHandleClear) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      // 逻辑：输入为空时用删除键清空项目范围，避免影响输入内容。
      event.preventDefault();
      onClearProject?.();
    },
    [onClearProject, shouldHandleClear],
  );

  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 w-full items-center gap-2 border-b px-3 sm:min-w-[520px]"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      {hasProject ? (
        <div className="flex items-center gap-1 text-sm text-foreground/80">
          <span className="max-w-[180px] truncate">{projectTitle}</span>
          <span className="text-muted-foreground">/</span>
        </div>
      ) : null}
      <CommandPrimitive.Input
        data-slot="command-input"
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          !hasProject && "pl-0",
        )}
      />
    </div>
  );
}
