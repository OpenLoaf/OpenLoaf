"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ModelDefinition } from "@teatime-ai/api/common";
import type { ImageGenerateOptions } from "@teatime-ai/api/types/image";
import { mergeImageOptions } from "@/lib/chat/image-options";
import { useChatContext } from "./ChatProvider";

interface ChatImageOutputOptionProps {
  /** Optional className for the container. */
  className?: string;
  /** Selected model definition. */
  model?: ModelDefinition | null;
}

type OptionButtonProps = {
  /** Whether this option is active. */
  active: boolean;
  /** Button label. */
  label: string;
  /** Click handler. */
  onClick: () => void;
};

/** Render a compact option button. */
function OptionButton({ active, label, onClick }: OptionButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "outline"}
      className="h-7 px-2 text-xs"
      onClick={onClick}
    >
      {label}
    </Button>
  );
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

/** Image count presets. */
const COUNT_OPTIONS = [1, 2, 3, 4];
/** Image size presets. */
const SIZE_OPTIONS = ["1024x1024", "1024x1792", "1792x1024"];
/** Image aspect ratio presets. */
const RATIO_OPTIONS = ["1:1", "4:3", "3:4", "16:9", "9:16"];
/** OpenAI style presets. */
const STYLE_OPTIONS = ["vivid", "natural"];

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
}: ChatImageOutputOptionProps) {
  const { imageOptions, setImageOptions } = useChatContext();
  const isOpenAi = isOpenAiProvider(model?.providerId);
  const qualityOptions = resolveQualityOptions(model?.id);

  const countValue = imageOptions?.n;
  const sizeValue = imageOptions?.size ?? "";
  const ratioValue = imageOptions?.aspectRatio ?? "";
  const seedValue = imageOptions?.seed;
  const qualityValue = imageOptions?.providerOptions?.openai?.quality ?? "";
  const styleValue = imageOptions?.providerOptions?.openai?.style ?? "";

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

  /** Handle seed input updates. */
  const handleSeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    if (!nextValue.trim()) {
      // 中文注释：空值代表不透传 seed。
      updateOptions({ seed: undefined });
      return;
    }
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return;
    updateOptions({ seed: parsed });
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2",
        className
      )}
    >
      <OptionGroup label="数量">
        <OptionButton
          active={countValue === undefined}
          label="Auto"
          onClick={() => updateOptions({ n: undefined })}
        />
        {COUNT_OPTIONS.map((count) => (
          <OptionButton
            key={count}
            active={countValue === count}
            label={String(count)}
            onClick={() => updateOptions({ n: count })}
          />
        ))}
      </OptionGroup>

      <OptionGroup label="尺寸">
        <OptionButton
          active={!sizeValue}
          label="Auto"
          onClick={() => updateOptions({ size: undefined })}
        />
        {SIZE_OPTIONS.map((size) => (
          <OptionButton
            key={size}
            active={sizeValue === size}
            label={size}
            onClick={() =>
              // 中文注释：尺寸与比例二选一，选尺寸时清空比例。
              updateOptions({ size, aspectRatio: undefined })
            }
          />
        ))}
      </OptionGroup>

      <OptionGroup label="比例">
        <OptionButton
          active={!ratioValue}
          label="Auto"
          onClick={() => updateOptions({ aspectRatio: undefined })}
        />
        {RATIO_OPTIONS.map((ratio) => (
          <OptionButton
            key={ratio}
            active={ratioValue === ratio}
            label={ratio}
            onClick={() =>
              // 中文注释：尺寸与比例二选一，选比例时清空尺寸。
              updateOptions({ aspectRatio: ratio, size: undefined })
            }
          />
        ))}
      </OptionGroup>

      {isOpenAi ? (
        <>
          <OptionGroup label="质量">
            <OptionButton
              active={!qualityValue}
              label="Auto"
              onClick={() => updateOpenAiOptions({ quality: undefined })}
            />
            {qualityOptions.map((quality) => (
              <OptionButton
                key={quality}
                active={qualityValue === quality}
                label={quality}
                onClick={() => updateOpenAiOptions({ quality })}
              />
            ))}
          </OptionGroup>
          <OptionGroup label="风格">
            <OptionButton
              active={!styleValue}
              label="Auto"
              onClick={() => updateOpenAiOptions({ style: undefined })}
            />
            {STYLE_OPTIONS.map((style) => (
              <OptionButton
                key={style}
                active={styleValue === style}
                label={style}
                onClick={() => updateOpenAiOptions({ style })}
              />
            ))}
          </OptionGroup>
        </>
      ) : null}

      <OptionGroup label="Seed">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          className="h-7 w-24 text-xs"
          placeholder="Auto"
          value={typeof seedValue === "number" ? String(seedValue) : ""}
          onChange={handleSeedChange}
        />
      </OptionGroup>
    </div>
  );
}
