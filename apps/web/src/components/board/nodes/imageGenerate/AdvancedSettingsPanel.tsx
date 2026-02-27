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
import { Card, CardContent, CardHeader, CardTitle } from "@openloaf/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import { Textarea } from "@openloaf/ui/textarea";
import TagsInputBasic from "@/components/ui/basic-tags-input";

import {
  IMAGE_GENERATE_ASPECT_RATIO_OPTIONS,
  IMAGE_GENERATE_COUNT_OPTIONS,
  IMAGE_GENERATE_STYLE_SUGGESTIONS,
} from "./constants";
import { normalizeOutputCount } from "./utils";

type AdvancedSettingsPanelProps = {
  open: boolean;
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

/** Render the advanced settings panel. */
export function AdvancedSettingsPanel({
  open,
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
  if (!open) return null;

  return (
    <Card
      className="absolute left-full top-0 z-20 ml-4 w-60 gap-3 border-slate-200/80 bg-white/95 py-0 text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100"
      data-board-editor
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <CardHeader className="border-b border-slate-200/70 px-2.5 py-1 !pb-1 !gap-0 dark:border-slate-700/70">
        <CardTitle className="text-[12px] font-semibold text-slate-600 dark:text-slate-200">
          高级设置
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2.5 pb-2 pt-1.5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 text-[11px] text-slate-500 dark:text-slate-300">
              数量
            </div>
            <Tabs
              value={String(outputCount)}
              onValueChange={(value) => {
                const parsed = Number(value);
                onOutputCountChange(normalizeOutputCount(parsed));
              }}
            >
              <TabsList className="grid h-6 w-28 grid-cols-5 rounded-md bg-slate-100/80 p-0.5 dark:bg-slate-800/80">
                {IMAGE_GENERATE_COUNT_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={String(option)}
                    className="h-5 text-[10px] text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:text-slate-300 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-slate-50"
                    disabled={disabled}
                  >
                    {option}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 text-[11px] text-slate-500 dark:text-slate-300">
              宽高比
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
                    "flex h-6 w-26 items-center justify-between rounded-md border border-slate-200/80 bg-white/90 px-2 text-[11px] text-slate-600",
                    "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800",
                  ].join(" ")}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect();
                  }}
                >
                  <span className="truncate">
                    {outputAspectRatioValue === "auto" ? "自动" : outputAspectRatioValue}
                  </span>
                  <ChevronDown size={12} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                sideOffset={4}
                className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto rounded-md border border-slate-200/80 bg-white p-1 text-[11px] text-slate-700 shadow-none dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100"
              >
                {["auto", ...IMAGE_GENERATE_ASPECT_RATIO_OPTIONS].map((option) => {
                  const label = option === "auto" ? "自动" : option;
                  const isActive =
                    option === "auto"
                      ? outputAspectRatioValue === "auto"
                      : option === outputAspectRatioValue;
                  return (
                    <button
                      key={option}
                      type="button"
                      className={[
                        "flex w-full items-center rounded px-2 py-1.5 text-left text-[11px]",
                        "hover:bg-slate-100 dark:hover:bg-slate-800",
                        isActive
                          ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                          : "text-slate-700 dark:text-slate-200",
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
          <div className="flex items-center gap-1">
            <TagsInputBasic
              dense
              label="风格"
              placeholder={styleTags.length ? "" : "回车可自定义风格"}
              suggestions={[...IMAGE_GENERATE_STYLE_SUGGESTIONS]}
              value={styleTags}
              onValueChange={onStyleChange}
              className="w-32"
              disabled={disabled}
            />
          </div>
          <div className="min-w-0">
            <Textarea
              value={negativePromptText}
              maxLength={200}
              placeholder="不希望出现"
              onChange={(event) => {
                const next = event.target.value.slice(0, 200);
                onNegativePromptChange(next);
              }}
              data-board-scroll
              className="min-h-[48px] w-full resize-none overflow-y-auto px-2.5 py-1.5 text-[10px] leading-4 text-slate-600 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-200 dark:placeholder:text-slate-500"
              disabled={disabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
