"use client";

import type { ChangeEvent } from "react";
import type { ModelParameterDefinition } from "@tenas-ai/api/common";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@tenas-ai/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@tenas-ai/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";
import { Input } from "@tenas-ai/ui/input";
import { Textarea } from "@tenas-ai/ui/textarea";
import TagsInputBasic from "@/components/ui/basic-tags-input";
import {
  VIDEO_GENERATE_ASPECT_RATIO_OPTIONS,
  VIDEO_GENERATE_DURATION_OPTIONS,
  VIDEO_GENERATE_STYLE_SUGGESTIONS,
} from "./constants";

type AdvancedSettingsPanelProps = {
  open: boolean;
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

/** Render the advanced settings panel. */
export function AdvancedSettingsPanel({
  open,
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
                className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto rounded-md border border-slate-200/80 bg-white p-1 text-[11px] text-slate-700 shadow-none dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100"
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
            <div className="min-w-0 flex-1 text-[11px] text-slate-500 dark:text-slate-300">
              时长
            </div>
            <Tabs
              value={durationSeconds ? String(durationSeconds) : ""}
              onValueChange={(value) => {
                const parsed = Number(value);
                onDurationChange(Number.isFinite(parsed) ? parsed : undefined);
              }}
            >
              <TabsList className="grid h-6 w-20 grid-cols-2 rounded-md bg-slate-100/80 p-0.5 dark:bg-slate-800/80">
                {VIDEO_GENERATE_DURATION_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={String(option)}
                    className="h-5 text-[10px] text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:text-slate-300 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-slate-50"
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
                <div className="text-[11px] text-slate-500 dark:text-slate-300">
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
      </CardContent>
    </Card>
  );
}
