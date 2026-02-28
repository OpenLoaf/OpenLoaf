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

import type { ChangeEvent } from "react";
import type { ModelParameterDefinition } from "@openloaf/api/common";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { Input } from "@openloaf/ui/input";
import { Textarea } from "@openloaf/ui/textarea";
import TagsInputBasic from "@/components/ui/basic-tags-input";
import {
  VIDEO_GENERATE_ASPECT_RATIO_OPTIONS,
  VIDEO_GENERATE_DURATION_OPTIONS,
  VIDEO_GENERATE_STYLE_SUGGESTIONS,
} from "./constants";

type AdvancedSettingsPanelProps = {
  parameterFields: ModelParameterDefinition[];
  resolvedParameters: Record<string, string | number | boolean>;
  onParameterChange: (key: string, value: string | number | boolean) => void;
  aspectRatioValue: string;
  aspectRatioOpen: boolean;
  onAspectRatioOpenChange: (open: boolean) => void;
  onAspectRatioChange: (value: string | undefined) => void;
  durationSeconds: number | undefined;
  onDurationChange: (value: number | undefined) => void;
  styleTags: string[];
  onStyleChange: (value: string[]) => void;
  negativePromptText: string;
  onNegativePromptChange: (value: string) => void;
  disabled: boolean;
};

/** Render the advanced settings content (wrapped by parent Collapsible). */
export function AdvancedSettingsPanel({
  parameterFields,
  resolvedParameters,
  onParameterChange,
  aspectRatioValue,
  aspectRatioOpen,
  onAspectRatioOpenChange,
  onAspectRatioChange,
  durationSeconds,
  onDurationChange,
  styleTags,
  onStyleChange,
  negativePromptText,
  onNegativePromptChange,
  disabled,
}: AdvancedSettingsPanelProps) {
  return (
    <div className="rounded-xl bg-[#f6f8fc] p-2.5 dark:bg-[hsl(var(--muted)/0.26)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1 text-[11px] text-[#5f6368] dark:text-slate-300">
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
                  "flex h-6 w-26 items-center justify-between rounded-full border border-[#e3e8ef] bg-white/90 px-2 text-[11px] text-[#5f6368]",
                  "hover:bg-[#f1f3f4] disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800",
                ].join(" ")}
              >
                <span className="truncate">
                  {aspectRatioValue === "auto" ? "自动" : aspectRatioValue}
                </span>
                <ChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto rounded-md border border-[#e3e8ef] bg-white p-1 text-[11px] text-[#5f6368] shadow-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {["auto", ...VIDEO_GENERATE_ASPECT_RATIO_OPTIONS].map((option) => {
                const label = option === "auto" ? "自动" : option;
                const isActive =
                  option === "auto"
                    ? aspectRatioValue === "auto"
                    : option === aspectRatioValue;
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      "flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] transition-colors duration-150",
                      "hover:bg-[#f1f3f4] dark:hover:bg-slate-800",
                      isActive
                        ? "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50"
                        : "text-[#5f6368] dark:text-slate-200",
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
          <div className="min-w-0 flex-1 text-[11px] text-[#5f6368] dark:text-slate-300">
            时长
          </div>
          <Tabs
            value={durationSeconds ? String(durationSeconds) : ""}
            onValueChange={(value) => {
              const parsed = Number(value);
              onDurationChange(Number.isFinite(parsed) ? parsed : undefined);
            }}
          >
            <TabsList className="grid h-6 w-20 grid-cols-2 rounded-md bg-[#f1f3f4] p-0.5 dark:bg-slate-800/80">
              {VIDEO_GENERATE_DURATION_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option}
                  value={String(option)}
                  className="h-5 text-[10px] text-[#5f6368] data-[state=active]:bg-white data-[state=active]:text-[#1a73e8] dark:text-slate-300 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-sky-300"
                  disabled={disabled}
                >
                  {option}s
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-1">
          <TagsInputBasic
            dense
            label="风格"
            placeholder={styleTags.length ? "" : "回车可自定义风格"}
            suggestions={[...VIDEO_GENERATE_STYLE_SUGGESTIONS]}
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
        {parameterFields.map((field) => {
          const value = resolvedParameters[field.key];
          const valueString = value === undefined ? "" : String(value);
          const label = (
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[11px] text-[#5f6368] dark:text-slate-300">
                {field.title}
              </div>
              {field.description ? (
                <div className="text-[10px] leading-[14px] text-slate-400 dark:text-slate-500">
                  {field.description}
                </div>
              ) : null}
            </div>
          );
          if (field.type === "select") {
            const options = Array.isArray(field.values)
              ? (field.values as Array<string | number | boolean>)
              : [];
            return (
              <div className="flex items-start gap-3" key={field.key}>
                {label}
                <Select
                  value={valueString}
                  onValueChange={(nextValue) => {
                    const matched = options.find(
                      (option) => String(option) === nextValue
                    );
                    onParameterChange(field.key, matched ?? nextValue);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 w-28 px-2 text-[11px] shadow-none">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent className="text-[11px]">
                    {options.map((option) => (
                      <SelectItem
                        key={`${field.key}-${String(option)}`}
                        value={String(option)}
                        className="text-[11px]"
                      >
                        {String(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }
          if (field.type === "number") {
            const numericValue =
              typeof value === "number"
                ? value
                : typeof value === "string" && value.trim()
                  ? Number(value)
                  : "";
            return (
              <div className="flex items-start gap-3" key={field.key}>
                {label}
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    min={typeof field.min === "number" ? field.min : undefined}
                    max={typeof field.max === "number" ? field.max : undefined}
                    step={typeof field.step === "number" ? field.step : undefined}
                    value={Number.isFinite(numericValue as number) ? numericValue : ""}
                    disabled={disabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const raw = event.target.value;
                      const nextValue = raw.trim() === "" ? "" : Number.parseFloat(raw);
                      onParameterChange(
                        field.key,
                        Number.isFinite(nextValue) ? nextValue : ""
                      );
                    }}
                    className="h-7 w-20 px-2 text-[11px]"
                  />
                  {field.unit ? (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                      {field.unit}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }
          if (field.type === "boolean") {
            return (
              <div className="flex items-start gap-3" key={field.key}>
                {label}
                <Select
                  value={valueString}
                  onValueChange={(nextValue) => {
                    onParameterChange(field.key, nextValue === "true");
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 w-24 px-2 text-[11px] shadow-none">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent className="text-[11px]">
                    <SelectItem value="true" className="text-[11px]">
                      是
                    </SelectItem>
                    <SelectItem value="false" className="text-[11px]">
                      否
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          }
          return (
            <div className="flex items-start gap-3" key={field.key}>
              {label}
              <Input
                type="text"
                value={valueString}
                disabled={disabled}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  onParameterChange(field.key, event.target.value);
                }}
                className="h-7 w-28 px-2 text-[11px] shrink-0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
