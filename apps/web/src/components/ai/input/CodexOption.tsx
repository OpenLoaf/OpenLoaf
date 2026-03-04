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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import {
  DEFAULT_CODEX_MODE,
  DEFAULT_CODEX_REASONING_EFFORT,
  normalizeCodexOptions,
  type CodexMode,
  type CodexReasoningEffort,
} from "@/lib/chat/codex-options";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { useChatOptions, useChatSession } from "../context";
import { useMainAgentModel } from "../hooks/use-main-agent-model";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";

const CODEX_MODEL_LABELS: Record<string, string> = {
  "gpt-5.3-codex": "GPT-5.3-Codex",
  "gpt-5.2-codex": "GPT-5.2-Codex",
  "gpt-5-codex": "GPT-5-Codex",
};

/** Build a readable label for Codex model ids. */
function resolveCodexModelLabel(modelId: string): string {
  return CODEX_MODEL_LABELS[modelId] ?? modelId;
}

type CodexOptionProps = {
  /** Optional className for the container. */
  className?: string;
  /** Visual style variant. */
  variant?: "card" | "inline";
  /** Whether to display mode selector. */
  showMode?: boolean;
  /** Hide field labels for compact inline display. */
  hideLabels?: boolean;
  /** Disable all selects when conversation is locked. */
  disabled?: boolean;
};

type OptionGroupProps = {
  /** Group label. */
  label: string;
  /** Hide label text. */
  hideLabel?: boolean;
  /** Option items. */
  children: React.ReactNode;
};

/** Render a compact option group. */
function OptionGroup({ label, hideLabel = false, children }: OptionGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hideLabel ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}
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
  /** Hide label text. */
  hideLabel?: boolean;
  /** Disable select interaction. */
  disabled?: boolean;
  /** Change handler. */
  onChange: (value: string) => void;
};

type StrengthLevelValue = "low" | "medium" | "high";

type StrengthToggleOption = {
  /** Strength value. */
  value: StrengthLevelValue;
  /** Accessible label. */
  label: string;
};

type StrengthLevelToggleProps = {
  /** Group label text. */
  label: string;
  /** Hide label text for compact mode. */
  hideLabel?: boolean;
  /** Current selected level. */
  value: StrengthLevelValue;
  /** Toggle options. */
  options: StrengthToggleOption[];
  /** Disable interaction. */
  disabled?: boolean;
  /** Change handler. */
  onChange: (value: StrengthLevelValue) => void;
};

/** Render a compact select field. */
function OptionSelect({
  label,
  value,
  options,
  triggerClassName,
  contentClassName,
  hideLabel,
  disabled,
  onChange,
}: OptionSelectProps) {
  return (
    <OptionGroup label={label} hideLabel={hideLabel}>
      <PromptInputSelect
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <PromptInputSelectTrigger
          className={cn(
            "h-7 min-w-[120px] rounded-md px-2 text-xs shadow-xs",
            disabled && "cursor-not-allowed opacity-60",
            triggerClassName,
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

/** Render three-level strength energy bar with square blocks. */
function StrengthLevelToggle({
  label,
  hideLabel,
  value,
  options,
  disabled = false,
  onChange,
}: StrengthLevelToggleProps) {
  const activeLevel = value === "high" ? 3 : value === "medium" ? 2 : 1;
  const handleStrengthSelect = React.useCallback(
    (nextValue: StrengthLevelValue) => {
      if (disabled) return;
      onChange(nextValue);
    },
    [disabled, onChange],
  );

  const handleStrengthKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, nextValue: StrengthLevelValue) => {
      if (disabled) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onChange(nextValue);
    },
    [disabled, onChange],
  );

  return (
    <OptionGroup label={label} hideLabel={hideLabel}>
      <div className="inline-flex items-end gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((option, index) => {
          const level = index + 1;
          const isFilled = level <= activeLevel;
          return (
            <div
              key={option.value}
              title={option.label}
              role="radio"
              aria-label={option.label}
              aria-checked={option.value === value}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : option.value === value ? 0 : -1}
              onClick={() => handleStrengthSelect(option.value)}
              onKeyDown={(event) => handleStrengthKeyDown(event, option.value)}
              className={cn(
                "h-4 w-2 rounded-[1px] transition-colors",
                isFilled ? "bg-emerald-500" : "bg-emerald-500/25",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                !disabled &&
                  "hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60",
              )}
            />
          );
        })}
      </div>
    </OptionGroup>
  );
}

/** Codex CLI chat options. */
export default function CodexOption({
  className,
  variant = "card",
  showMode = true,
  hideLabels = false,
  disabled = false,
}: CodexOptionProps) {
  const { t } = useTranslation("ai");
  const { projectId } = useChatSession();
  const { codexOptions, setCodexOptions } = useChatOptions();
  const { detail, setCodeModelIds } = useMainAgentModel(projectId);
  useInstalledCliProviderIds();

  // 逻辑：从 server 获取 Codex CLI 可用模型列表
  const codexModelsQuery = trpc.settings.getCodexModels.useQuery();
  const codeModels = React.useMemo(() => {
    const models = codexModelsQuery.data ?? [];
    return models.map((model) => ({
      id: `codex-cli:${model.id}`,
      modelId: model.id,
      providerId: "codex-cli",
      providerName: "Codex CLI",
      tags: model.tags,
      modelDefinition: { ...model, providerId: "codex-cli" },
    }));
  }, [codexModelsQuery.data]);

  // 逻辑：将当前 codeModelId 对齐到 Codex provider 的 modelId（下拉框 value）。
  const currentCodeModelId = detail?.codeModelIds?.[0] ?? "";
  const currentModelId = React.useMemo(() => {
    if (!currentCodeModelId.startsWith("codex-cli:")) return "";
    return currentCodeModelId.slice("codex-cli:".length).trim();
  }, [currentCodeModelId]);

  const modelOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    // 优先使用注册表中的模型
    for (const model of codeModels) {
      options.set(model.modelId, model.modelDefinition?.name ?? resolveCodexModelLabel(model.modelId));
    }
    // 如果当前选择的模型不在列表中，也添加进去（兼容性）
    if (currentModelId && !options.has(currentModelId)) {
      options.set(currentModelId, resolveCodexModelLabel(currentModelId));
    }
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [codeModels, currentModelId]);

  const resolvedModelId = React.useMemo(() => {
    if (currentModelId && modelOptions.some((item) => item.value === currentModelId)) {
      return currentModelId;
    }
    return modelOptions[0]?.value ?? "";
  }, [currentModelId, modelOptions]);

  const handleModelChange = React.useCallback(
    (modelId: string) => {
      const option = codeModels.find((m) => m.modelId === modelId);
      if (option) {
        setCodeModelIds([option.id]);
        return;
      }
      // 逻辑：注册表未就绪时，仍可按 provider:modelId 直接写入选择。
      setCodeModelIds([`codex-cli:${modelId}`]);
    },
    [codeModels, setCodeModelIds],
  );

  const modeOptions = React.useMemo<Array<{ label: string; value: CodexMode }>>(
    () => [
      { label: t("input.cliOptions.modeChat"), value: "chat" },
      { label: t("input.cliOptions.modeAgent"), value: "agent" },
      {
        label: t("input.cliOptions.modeAgentFullAccess"),
        value: "agent_full_access",
      },
    ],
    [t],
  );

  const strengthOptions = React.useMemo<StrengthToggleOption[]>(
    () => [
      { value: "low", label: t("input.cliOptions.strengthLow") },
      { value: "medium", label: t("input.cliOptions.strengthMedium") },
      { value: "high", label: t("input.cliOptions.strengthHigh") },
    ],
    [t],
  );

  const normalized = normalizeCodexOptions(codexOptions);
  const modeValue = normalized.mode ?? DEFAULT_CODEX_MODE;
  const effortValue = normalized.reasoningEffort ?? DEFAULT_CODEX_REASONING_EFFORT;
  const strengthValue: StrengthLevelValue =
    effortValue === "low" || effortValue === "medium" ? effortValue : "high";

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
        label={t("input.cliOptions.modelLabel")}
        hideLabel={hideLabels}
        value={resolvedModelId}
        options={modelOptions}
        disabled={disabled}
        onChange={handleModelChange}
      />
      {showMode ? (
        <OptionSelect
          label={t("input.cliOptions.modeLabel")}
          hideLabel={hideLabels}
          value={modeValue}
          options={modeOptions}
          disabled={disabled}
          onChange={(value) =>
            setCodexOptions((prev) => ({ ...normalizeCodexOptions(prev), mode: value as CodexMode }))
          }
        />
      ) : null}
      <StrengthLevelToggle
        label={t("input.cliOptions.strengthLabel")}
        hideLabel={hideLabels}
        value={strengthValue}
        options={strengthOptions}
        disabled={disabled}
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
