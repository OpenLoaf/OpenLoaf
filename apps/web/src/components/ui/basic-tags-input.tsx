"use client";

import { TagsInput } from "@ark-ui/react/tags-input";
import { Popover, PopoverAnchor, PopoverContent } from "@openloaf/ui/popover";
import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type TagsInputBasicProps = {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  dense?: boolean;
  suggestions?: string[];
};

export default function TagsInputBasic({
  value,
  defaultValue,
  onValueChange,
  label = "Frameworks",
  placeholder = "Add Framework",
  className,
  disabled = false,
  dense = false,
  suggestions = [],
}: TagsInputBasicProps) {
  const containerClassName = dense
    ? ["w-full", className].filter(Boolean).join(" ")
    : [
        "bg-white dark:bg-gray-800 w-full px-4 py-12 rounded-xl flex flex-col items-center",
        className,
      ]
        .filter(Boolean)
        .join(" ");
  const rootClassName = dense ? "w-full" : "w-full max-w-md";
  const labelClassName = dense
    ? "block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1"
    : "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
  const labelRowClassName = dense
    ? "mb-1 flex items-center justify-between"
    : "mb-1 flex items-center justify-between";
  const clearClassName = dense
    ? "text-[10px] text-gray-500 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:text-gray-200"
    : "text-xs text-gray-500 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:text-gray-200";
  const controlClassName = dense
    ? "flex flex-wrap gap-1 p-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-h-7 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-blue-500/50 dark:focus-within:ring-blue-400/50 focus-within:border-blue-500 dark:focus-within:border-blue-400"
    : "flex flex-wrap gap-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-h-8 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-blue-500/50 dark:focus-within:ring-blue-400/50 focus-within:border-blue-500 dark:focus-within:border-blue-400";
  const itemClassName = dense
    ? "flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-[11px] dark:bg-gray-700 dark:text-gray-200"
    : "flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-800 rounded text-xs dark:bg-gray-700 dark:text-gray-200";
  const itemInputClassName = dense
    ? "bg-transparent border-none outline-none text-[11px]"
    : "bg-transparent border-none outline-none text-xs";
  const inputClassName = dense
    ? "flex-1 min-w-[60px] bg-transparent border-none outline-none text-[11px] text-gray-900 placeholder-gray-500 dark:text-gray-100 dark:placeholder-gray-400"
    : "flex-1 min-w-[80px] bg-transparent border-none outline-none text-xs text-gray-900 placeholder-gray-500 dark:text-gray-100 dark:placeholder-gray-400";
  const suggestionsPanelClassName = dense
    ? "z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-gray-200 bg-white p-1 shadow-none dark:border-gray-700 dark:bg-gray-800"
    : "z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-gray-200 bg-white p-2 shadow-none dark:border-gray-700 dark:bg-gray-800";
  const suggestionItemClassName = dense
    ? "flex w-full items-center rounded px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
    : "flex w-full items-center rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700";

  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (disabled) {
        setSuggestionsOpen(false);
        return;
      }
      setSuggestionsOpen(nextOpen);
    },
    [disabled]
  );

  return (
    <div className={containerClassName}>
      <TagsInput.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(details) => {
          onValueChange?.(details.value);
        }}
        className={rootClassName}
        disabled={disabled}
      >
        <TagsInput.Context>
          {(tagsInput) => (
            <>
              <div className={labelRowClassName}>
                <TagsInput.Label className={labelClassName}>{label}</TagsInput.Label>
                {tagsInput.value.length > 0 && !disabled ? (
                  <TagsInput.ClearTrigger className={clearClassName}>
                    清除
                  </TagsInput.ClearTrigger>
                ) : null}
              </div>
              <Popover open={suggestionsOpen} onOpenChange={handleOpenChange}>
                <PopoverAnchor asChild>
                  <div ref={controlRef}>
                    <TagsInput.Control
                      className={controlClassName}
                      onPointerDown={() => {
                        if (suggestions.length > 0 && !disabled) {
                          setSuggestionsOpen(true);
                        }
                      }}
                    >
                      {tagsInput.value.map((tag, index) => (
                        <TagsInput.Item
                          key={`${tag}-${index}`}
                          index={index}
                          value={tag}
                          className={itemClassName}
                        >
                          <TagsInput.ItemPreview className="flex items-center gap-1">
                            <TagsInput.ItemText>{tag}</TagsInput.ItemText>
                            <TagsInput.ItemDeleteTrigger className="flex items-center justify-center w-3 h-3 hover:bg-gray-200 rounded transition-colors dark:hover:bg-gray-600">
                              <X className="w-2 h-2" />
                            </TagsInput.ItemDeleteTrigger>
                          </TagsInput.ItemPreview>
                          <TagsInput.ItemInput className={itemInputClassName} />
                        </TagsInput.Item>
                      ))}
                      <TagsInput.Input
                        placeholder={placeholder}
                        className={inputClassName}
                        onFocus={() => {
                          if (suggestions.length > 0 && !disabled) {
                            setSuggestionsOpen(true);
                          }
                        }}
                      />
                    </TagsInput.Control>
                  </div>
                </PopoverAnchor>
                {suggestions.length > 0 ? (
                  <PopoverContent
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    className={suggestionsPanelClassName}
                    onInteractOutside={(event) => {
                      const target = event.target as Node | null;
                      if (target && controlRef.current?.contains(target)) {
                        event.preventDefault();
                        return;
                      }
                      setSuggestionsOpen(false);
                    }}
                    onEscapeKeyDown={() => {
                      setSuggestionsOpen(false);
                    }}
                  >
                    {suggestions.map((tag) => {
                      const isActive = tagsInput.value.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          disabled={disabled || isActive}
                          className={[
                            suggestionItemClassName,
                            isActive ? "opacity-50" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            tagsInput.addValue(tag);
                            setSuggestionsOpen(false);
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </PopoverContent>
                ) : null}
              </Popover>
            </>
          )}
        </TagsInput.Context>
        <TagsInput.HiddenInput />
      </TagsInput.Root>
    </div>
  );
}
