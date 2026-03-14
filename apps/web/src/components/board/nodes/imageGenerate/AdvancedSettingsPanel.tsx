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

import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import { Textarea } from "@openloaf/ui/textarea";
import TagsInputBasic from "@/components/ui/basic-tags-input";
import { useTranslation } from "react-i18next";

import {
  IMAGE_GENERATE_ASPECT_RATIO_OPTIONS,
  IMAGE_GENERATE_COUNT_OPTIONS,
  IMAGE_GENERATE_STYLE_SUGGESTIONS,
} from "./constants";
import { normalizeOutputCount } from "./utils";

type AdvancedSettingsPanelProps = {
  outputCount: number;
  outputAspectRatioValue: string;
  aspectRatioOpen: boolean;
  styleTags: string[];
  negativePromptText: string;
  onSelect: () => void;
  onOutputCountChange: (count: number) => void;
  onAspectRatioOpenChange: (open: boolean) => void;
  onAspectRatioChange: (value: string | undefined) => void;
  onStyleChange: (value: string[]) => void;
  onNegativePromptChange: (value: string) => void;
  disabled: boolean;
};

/** Render the advanced settings content (wrapped by parent Collapsible). */
export function AdvancedSettingsPanel({
  outputCount,
  outputAspectRatioValue,
  aspectRatioOpen,
  styleTags,
  negativePromptText,
  onSelect,
  onOutputCountChange,
  onAspectRatioOpenChange,
  onAspectRatioChange,
  onStyleChange,
  onNegativePromptChange,
  disabled,
}: AdvancedSettingsPanelProps) {
  const { t } = useTranslation('board');
  return (
    <div>
      <div className="border-t border-border/40 my-1" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1 text-[11px] text-ol-text-auxiliary">
            {t('imageGenerate.advanced.count')}
          </div>
          <Tabs
            value={String(outputCount)}
            onValueChange={(value) => {
              const parsed = Number(value);
              onOutputCountChange(normalizeOutputCount(parsed));
            }}
          >
            <TabsList className="grid h-6 w-28 grid-cols-5 rounded-md bg-ol-surface-muted p-0.5">
              {IMAGE_GENERATE_COUNT_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option}
                  value={String(option)}
                  className="h-5 text-[10px] text-ol-text-auxiliary data-[state=active]:bg-background data-[state=active]:text-ol-blue"
                  disabled={disabled}
                >
                  {option}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1 text-[11px] text-ol-text-auxiliary">
            {t('imageGenerate.advanced.aspectRatio')}
          </div>
          <Popover
            open={aspectRatioOpen}
            onOpenChange={(openValue) => {
              if (disabled) return;
              onAspectRatioOpenChange(openValue);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={[
                  "flex h-6 w-26 items-center justify-between bg-muted/50 px-2 text-[11px] text-ol-text-auxiliary",
                  "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
                ].join(" ")}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelect();
                }}
              >
                <span className="truncate">
                  {outputAspectRatioValue === "auto" ? t('imageGenerate.advanced.auto') : outputAspectRatioValue}
                </span>
                <ChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto border border-border/60 bg-card p-1 text-[11px] text-ol-text-auxiliary shadow-sm"
            >
              {["auto", ...IMAGE_GENERATE_ASPECT_RATIO_OPTIONS].map((option) => {
                const label = option === "auto" ? t('imageGenerate.advanced.auto') : option;
                const isActive =
                  option === "auto"
                    ? outputAspectRatioValue === "auto"
                    : option === outputAspectRatioValue;
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      "flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] transition-colors duration-150",
                      "hover:bg-ol-surface-muted",
                      isActive
                        ? "bg-ol-blue-bg-hover text-ol-blue"
                        : "text-ol-text-auxiliary",
                    ].join(" ")}
                    onClick={() => {
                      onAspectRatioChange(option === "auto" ? undefined : option);
                      onAspectRatioOpenChange(false);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] text-ol-text-auxiliary">
              {t('imageGenerate.advanced.style')}
            </span>
            {styleTags.length > 0 && !disabled && (
              <button
                type="button"
                className="text-[10px] text-ol-text-auxiliary hover:text-ol-text-secondary transition-colors"
                onClick={() => onStyleChange([])}
              >
                {t('imageGenerate.advanced.clearStyle')}
              </button>
            )}
          </div>
          <TagsInputBasic
            dense
            placeholder={styleTags.length ? "" : t('imageGenerate.advanced.stylePlaceholder')}
            suggestions={[...IMAGE_GENERATE_STYLE_SUGGESTIONS]}
            value={styleTags}
            onValueChange={onStyleChange}
            disabled={disabled}
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] text-ol-text-auxiliary">
            {t('imageGenerate.advanced.negativePromptLabel')}
          </div>
          <Textarea
            value={negativePromptText}
            maxLength={200}
            placeholder={t('imageGenerate.advanced.negativePrompt')}
            onChange={(event) => {
              const next = event.target.value.slice(0, 200);
              onNegativePromptChange(next);
            }}
            data-board-scroll
            className="min-h-[28px] w-full resize-none overflow-y-auto border-0 bg-muted/50 px-2 py-1 text-[10px] leading-4 text-ol-text-secondary shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
