"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CODEX_MODE,
  DEFAULT_CODEX_REASONING_EFFORT,
  normalizeCodexOptions,
  type CodexMode,
  type CodexReasoningEffort,
} from "@/lib/chat/codex-options";
import { useChatContext } from "../ChatProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";

type CodexOptionProps = {
  /** Optional className for the container. */
  className?: string;
  /** Visual style variant. */
  variant?: "card" | "inline";
};

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
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            "h-7 min-w-[120px] rounded-md px-2 text-xs shadow-xs",
            triggerClassName,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-xs"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </OptionGroup>
  );
}

const MODE_OPTIONS: Array<{ label: string; value: CodexMode }> = [
  { label: "Chat", value: "chat" },
  { label: "Agent", value: "agent" },
  { label: "Agent Full Access", value: "agent_full_access" },
];

const EFFORT_OPTIONS: Array<{ label: string; value: CodexReasoningEffort }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Extra high", value: "xhigh" },
];

/** Codex CLI chat options. */
export default function CodexOption({ className, variant = "card" }: CodexOptionProps) {
  const { codexOptions, setCodexOptions } = useChatContext();
  const normalized = normalizeCodexOptions(codexOptions);
  const modeValue = normalized.mode ?? DEFAULT_CODEX_MODE;
  const effortValue = normalized.reasoningEffort ?? DEFAULT_CODEX_REASONING_EFFORT;

  React.useEffect(() => {
    setCodexOptions((prev) => {
      const next = normalizeCodexOptions(prev);
      if (
        prev?.mode === next.mode &&
        prev?.reasoningEffort === next.reasoningEffort
      ) {
        return prev;
      }
      return next;
    });
  }, [setCodexOptions]);

  const containerClassName =
    variant === "inline"
      ? "flex flex-wrap gap-3 px-2 py-2"
      : "flex flex-wrap gap-3 rounded-lg border border-border bg-background px-3 py-2";

  return (
    <div className={cn(containerClassName, className)}>
      <OptionSelect
        label="模式"
        value={modeValue}
        options={MODE_OPTIONS}
        onChange={(value) =>
          setCodexOptions((prev) => ({ ...normalizeCodexOptions(prev), mode: value as CodexMode }))
        }
      />
      <OptionSelect
        label="思考等级"
        value={effortValue}
        options={EFFORT_OPTIONS}
        onChange={(value) =>
          setCodexOptions((prev) => ({
            ...normalizeCodexOptions(prev),
            reasoningEffort: value as CodexReasoningEffort,
          }))
        }
      />
    </div>
  );
}
