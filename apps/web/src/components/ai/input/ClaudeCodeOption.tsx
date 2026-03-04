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
  DEFAULT_CC_EFFORT,
  normalizeClaudeCodeOptions,
  type ClaudeCodeEffort,
} from "@/lib/chat/claude-code-options";
import { useChatOptions, useChatSession } from "../context";
import { useMainAgentModel } from "../hooks/use-main-agent-model";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";

const CLAUDE_CODE_MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
};

const CLAUDE_CODE_MODEL_FALLBACK_IDS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
];

/** Build a readable label for Claude Code model ids. */
function resolveClaudeCodeModelLabel(modelId: string): string {
  return CLAUDE_CODE_MODEL_LABELS[modelId] ?? modelId;
}

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
    <div className="flex flex-wrap items-center gap-2">
      {!hideLabel ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}
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
    </div>
  );
}

type ClaudeCodeOptionProps = {
  className?: string;
  variant?: "card" | "inline";
  /** Hide field labels for compact inline display. */
  hideLabels?: boolean;
  /** Disable all selects when conversation is locked. */
  disabled?: boolean;
};

/** Claude Code 模型 + 强度选择栏。 */
export default function ClaudeCodeOption({
  className,
  variant = "card",
  hideLabels = false,
  disabled = false,
}: ClaudeCodeOptionProps) {
  const { t } = useTranslation("ai");
  const { claudeCodeOptions, setClaudeCodeOptions } = useChatOptions();
  const { projectId } = useChatSession();
  const normalized = normalizeClaudeCodeOptions(claudeCodeOptions);
  const effortValue = normalized.effort ?? DEFAULT_CC_EFFORT;
  const effortOptions = React.useMemo<StrengthToggleOption[]>(
    () => [
      { label: t("input.cliOptions.strengthLow"), value: "low" },
      { label: t("input.cliOptions.strengthMedium"), value: "medium" },
      { label: t("input.cliOptions.strengthHigh"), value: "high" },
    ],
    [t],
  );

  // 逻辑：触发 CLI 安装状态查询，避免与输入区其他逻辑时序不一致。
  useInstalledCliProviderIds();
  // 逻辑：从 server 获取 Claude Code CLI 可用模型列表
  const claudeCodeModelsQuery = trpc.settings.getClaudeCodeModels.useQuery();
  const codeModels = React.useMemo(() => {
    const models = claudeCodeModelsQuery.data ?? [];
    return models.map((model) => ({
      id: `claude-code-cli:${model.id}`,
      modelId: model.id,
      providerId: "claude-code-cli",
      providerName: "Claude Code",
      tags: model.tags,
      modelDefinition: { ...model, providerId: "claude-code-cli" },
    }));
  }, [claudeCodeModelsQuery.data]);

  // 逻辑：从 useMainAgentModel 获取/设置当前选择的 code model（与 ModelPreferencesPanel 同步）。
  const { detail, setCodeModelIds } = useMainAgentModel(projectId);
  const currentCodeModelId = detail?.codeModelIds?.[0] ?? "";
  const currentModelId = React.useMemo(() => {
    if (!currentCodeModelId.startsWith("claude-code-cli:")) return "";
    return currentCodeModelId.slice("claude-code-cli:".length).trim();
  }, [currentCodeModelId]);

  // 逻辑：从完整 id（如 "claude-code-cli:claude-sonnet-4-6"）解析实际的 model id 部分。
  const modelOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const model of codeModels) {
      options.set(
        model.modelId,
        model.modelDefinition?.name ?? resolveClaudeCodeModelLabel(model.modelId),
      );
    }
    if (currentModelId) {
      options.set(currentModelId, resolveClaudeCodeModelLabel(currentModelId));
    }
    for (const fallbackId of CLAUDE_CODE_MODEL_FALLBACK_IDS) {
      if (!options.has(fallbackId)) {
        options.set(fallbackId, resolveClaudeCodeModelLabel(fallbackId));
      }
    }
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [codeModels, currentModelId]);
  const resolvedModelId = React.useMemo(() => {
    if (currentModelId && modelOptions.some((item) => item.value === currentModelId)) {
      return currentModelId;
    }
    return modelOptions[0]?.value ?? "";
  }, [currentModelId, modelOptions]);

  // 逻辑：同步 claudeCodeOptions 默认值（首次渲染时确保 context 有初始值）。
  React.useEffect(() => {
    setClaudeCodeOptions((prev) => {
      const next = normalizeClaudeCodeOptions(prev);
      if (prev?.effort === next.effort) return prev;
      return next;
    });
  }, [setClaudeCodeOptions]);

  const handleModelChange = React.useCallback(
    (modelId: string) => {
      // modelId 是下拉框的 value（即 modelDefinition.id，如 "claude-sonnet-4-6"）
      const option = codeModels.find((m) => m.modelId === modelId);
      if (option) {
        setCodeModelIds([option.id]);
        return;
      }
      // 逻辑：注册表未就绪时，仍可按 provider:modelId 直接写入选择。
      setCodeModelIds([`claude-code-cli:${modelId}`]);
    },
    [codeModels, setCodeModelIds],
  );

  const containerClassName =
    variant === "inline"
      ? "flex flex-wrap gap-3 px-2 py-2"
      : "flex flex-wrap gap-3 rounded-lg border border-border bg-background px-3 py-2";

  return (
    <div className={cn(containerClassName, className)}>
      {/* 模型选择 */}
      <div className="flex flex-wrap items-center gap-2">
        {!hideLabels ? (
          <span className="text-xs text-muted-foreground">
            {t("input.cliOptions.modelLabel")}
          </span>
        ) : null}
        <PromptInputSelect
          value={resolvedModelId}
          onValueChange={handleModelChange}
          disabled={disabled}
        >
          <PromptInputSelectTrigger
            className={cn(
              "h-7 min-w-[140px] rounded-md px-2 text-xs shadow-xs",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <PromptInputSelectValue />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            {modelOptions.map((m) => (
              <PromptInputSelectItem
                key={m.value}
                value={m.value}
                className="text-xs"
              >
                {m.label}
              </PromptInputSelectItem>
            ))}
          </PromptInputSelectContent>
        </PromptInputSelect>
      </div>

      {/* 能力强度 */}
      <StrengthLevelToggle
        label={t("input.cliOptions.strengthLabel")}
        hideLabel={hideLabels}
        value={effortValue}
        options={effortOptions}
        disabled={disabled}
        onChange={(v) =>
          setClaudeCodeOptions((prev) => ({
            ...normalizeClaudeCodeOptions(prev),
            effort: v as ClaudeCodeEffort,
          }))
        }
      />
    </div>
  );
}
