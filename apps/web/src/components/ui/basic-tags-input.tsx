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
        "bg-background w-full px-4 py-12 rounded-xl flex flex-col items-center",
        className,
      ]
        .filter(Boolean)
        .join(" ");
  const rootClassName = dense ? "w-full" : "w-full max-w-md";
  const labelClassName = dense
    ? "block text-[11px] font-medium text-ol-text-secondary mb-1"
    : "block text-xs font-medium text-ol-text-secondary mb-1";
  const labelRowClassName = dense
    ? "mb-1 flex items-center justify-between"
    : "mb-1 flex items-center justify-between";
  const clearClassName = dense
    ? "text-[10px] text-ol-text-auxiliary hover:text-ol-text-secondary transition-colors"
    : "text-xs text-ol-text-auxiliary hover:text-ol-text-secondary transition-colors";
  const controlClassName = dense
    ? "flex flex-wrap gap-1 p-1.5 border border-ol-divider rounded-lg bg-background min-h-7 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-ol-focus-ring focus-within:border-ol-focus-border"
    : "flex flex-wrap gap-1 p-2 border border-ol-divider rounded-lg bg-background min-h-8 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-ol-focus-ring focus-within:border-ol-focus-border";
  const itemClassName = dense
    ? "flex items-center gap-1 px-1.5 py-0.5 bg-ol-surface-muted text-ol-text-primary rounded text-[11px]"
    : "flex items-center gap-1 px-2 py-0.5 bg-ol-surface-muted text-ol-text-primary rounded text-xs";
  const itemInputClassName = dense
    ? "bg-transparent border-none outline-none text-[11px]"
    : "bg-transparent border-none outline-none text-xs";
  const inputClassName = dense
    ? "flex-1 min-w-[60px] bg-transparent border-none outline-none text-[11px] text-ol-text-primary placeholder-ol-text-auxiliary"
    : "flex-1 min-w-[80px] bg-transparent border-none outline-none text-xs text-ol-text-primary placeholder-ol-text-auxiliary";
  const suggestionsPanelClassName = dense
    ? "z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-ol-divider bg-background p-1 shadow-none"
    : "z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-ol-divider bg-background p-2 shadow-none";
  const suggestionItemClassName = dense
    ? "flex w-full items-center rounded px-2 py-1 text-[11px] text-ol-text-secondary hover:bg-ol-surface-muted"
    : "flex w-full items-center rounded px-2 py-1.5 text-xs text-ol-text-secondary hover:bg-ol-surface-muted";

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
                            <TagsInput.ItemDeleteTrigger className="flex items-center justify-center w-3 h-3 hover:bg-ol-surface-muted rounded transition-colors">
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
