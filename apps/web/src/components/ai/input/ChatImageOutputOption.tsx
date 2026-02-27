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
import type { ModelTag } from "@openloaf/api/common";
import type { ImageGenerateOptions } from "@openloaf/api/types/image";
import { mergeImageOptions } from "@/lib/chat/image-options";
import { useChatOptions } from "../context";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";

export type ChatImageOutputTarget = {
  /** Model id. */
  id?: string;
  /** Provider id. */
  providerId?: string;
  /** Model tags. */
  tags?: ModelTag[];
};

interface ChatImageOutputOptionProps {
  /** Optional className for the container. */
  className?: string;
  /** Selected model definition. */
  model?: ChatImageOutputTarget | null;
  /** Visual style variant. */
  variant?: "card" | "inline";
  /** Hide aspect ratio selector. */
  hideAspectRatio?: boolean;
}

type OptionGroupProps = {
  /** Group label. */
  label: string;
  /** Option items. */
  children: React.ReactNode;
};

/** Render a compact option group. */
function OptionGroup({ label, children }: OptionGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

type OptionSelectProps = {
  /** Select label. */
  label: string;
  /** Current value. */
  value: string;
  /** Options for select. */
  options: Array<{ label: string; value: string }>;
  /** Optional trigger className. */
  triggerClassName?: string;
  /** Optional content className. */
  contentClassName?: string;
  /** Change handler. */
  onChange: (value: string) => void;
};

/** Render a compact select field. */
function OptionSelect({
  label,
  value,
  options,
  triggerClassName,
  contentClassName,
  onChange,
}: OptionSelectProps) {
  return (
    <OptionGroup label={label}>
      <PromptInputSelect value={value} onValueChange={onChange}>
        <PromptInputSelectTrigger
          className={cn(
            "h-7 min-w-[110px] rounded-md px-2 text-xs shadow-xs",
            triggerClassName
          )}
        >
          <PromptInputSelectValue />
        </PromptInputSelectTrigger>
        <PromptInputSelectContent className={contentClassName}>
          {options.map((option) => (
            <PromptInputSelectItem
              key={option.value}
              value={option.value}
              className="text-xs"
            >
              {option.label}
            </PromptInputSelectItem>
          ))}
        </PromptInputSelectContent>
      </PromptInputSelect>
    </OptionGroup>
  );
}

/** Image count presets. */
const COUNT_OPTIONS = [1, 2, 3, 4];
/** Image aspect ratio presets. */
const RATIO_OPTIONS = ["1:1", "4:3", "3:4", "16:9", "9:16"];
/** OpenAI style presets. */
const STYLE_OPTIONS = ["vivid", "natural"];
/** Aspect ratio options. */
const RATIO_SELECT_OPTIONS = RATIO_OPTIONS.map((value) => ({
  label: value,
  value,
}));

const DEFAULT_COUNT = COUNT_OPTIONS[0];
const DEFAULT_RATIO = "4:3";

/** Check whether the provider is OpenAI-compatible. */
function isOpenAiProvider(providerId?: string | null): boolean {
  if (!providerId) return false;
  return providerId.toLowerCase().includes("openai");
}

/** Resolve OpenAI quality options based on model id. */
function resolveQualityOptions(modelId?: string | null): string[] {
  const normalized = (modelId ?? "").toLowerCase();
  if (normalized.includes("gpt-image-1")) {
    return ["standard", "high"];
  }
  return ["standard", "hd"];
}

/** Chat image output options. */
export default function ChatImageOutputOption({
  className,
  model,
  variant = "card",
  hideAspectRatio,
}: ChatImageOutputOptionProps) {
  const { imageOptions, setImageOptions } = useChatOptions();
  const isOpenAi = isOpenAiProvider(model?.providerId);
  const canSelectCount = true;
  const showAspectRatio = !hideAspectRatio;
  const qualityOptions = React.useMemo(
    () => resolveQualityOptions(model?.id),
    [model?.id]
  );

  const countValue = imageOptions?.n ?? DEFAULT_COUNT;
  const ratioValue = imageOptions?.aspectRatio ?? "";
  const ratioSelectValue = ratioValue || DEFAULT_RATIO;
  const qualityValue =
    imageOptions?.providerOptions?.openai?.quality ?? qualityOptions[0];
  const styleValue = imageOptions?.providerOptions?.openai?.style ?? STYLE_OPTIONS[0];

  /** Apply partial options with normalization. */
  const updateOptions = React.useCallback(
    (patch: Partial<ImageGenerateOptions>) => {
      setImageOptions((prev) => mergeImageOptions(prev, patch));
    },
    [setImageOptions]
  );

  /** Update OpenAI-specific options. */
  const updateOpenAiOptions = React.useCallback(
    (patch: { quality?: string; style?: string }) => {
      setImageOptions((prev) => {
        const prevOpenAi = prev?.providerOptions?.openai ?? {};
        const nextOpenAi = { ...prevOpenAi, ...patch };
        return mergeImageOptions(prev, { providerOptions: { openai: nextOpenAi } });
      });
    },
    [setImageOptions]
  );

  React.useEffect(() => {
    setImageOptions((prev) => {
      const current = prev ?? {};
      const nextPatch: Partial<ImageGenerateOptions> = {};

      if (current.n === undefined) {
        nextPatch.n = DEFAULT_COUNT;
      }

      if (!current.aspectRatio && showAspectRatio) {
        nextPatch.aspectRatio = DEFAULT_RATIO;
      }

      if (isOpenAi) {
        const openaiOptions = current.providerOptions?.openai ?? {};
        if (!openaiOptions.quality) {
          nextPatch.providerOptions = {
            openai: { ...openaiOptions, quality: qualityOptions[0] },
          };
        }
        if (!openaiOptions.style) {
          nextPatch.providerOptions = {
            openai: { ...openaiOptions, ...nextPatch.providerOptions?.openai, style: STYLE_OPTIONS[0] },
          };
        }
      }

      if (!Object.keys(nextPatch).length) {
        return prev;
      }

      return mergeImageOptions(current, nextPatch);
    });
  }, [isOpenAi, qualityOptions, setImageOptions, showAspectRatio]);

  const containerClassName =
    variant === "inline"
      ? "flex flex-wrap gap-3 px-2 py-2"
      : "flex flex-wrap gap-3 rounded-lg border border-border bg-background px-3 py-2";

  return (
    <div className={cn(containerClassName, className)}>
      {canSelectCount ? (
        <OptionSelect
          label="图片数量"
          value={String(countValue)}
          options={COUNT_OPTIONS.map((count) => ({
            label: String(count),
            value: String(count),
          }))}
          triggerClassName="min-w-[56px]"
          contentClassName="min-w-[56px]"
          onChange={(value) => updateOptions({ n: Number(value) })}
        />
      ) : null}

      {showAspectRatio ? (
        <OptionSelect
          label="图片比例"
          value={ratioSelectValue}
          options={RATIO_SELECT_OPTIONS}
          triggerClassName="min-w-[63px]"
          contentClassName="min-w-[63px]"
          onChange={(value) => updateOptions({ aspectRatio: value, size: undefined })}
        />
      ) : null}

      {isOpenAi ? (
        <>
          <OptionSelect
            label="质量"
            value={qualityValue}
            options={qualityOptions.map((quality) => ({
              label: quality,
              value: quality,
            }))}
            onChange={(value) => updateOpenAiOptions({ quality: value })}
          />
          <OptionSelect
            label="风格"
            value={styleValue}
            options={STYLE_OPTIONS.map((style) => ({
              label: style,
              value: style,
            }))}
            onChange={(value) => updateOpenAiOptions({ style: value })}
          />
        </>
      ) : null}
    </div>
  );
}
