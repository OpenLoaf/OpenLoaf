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

import type { AiModel } from "@openloaf-saas/sdk";
import { ChevronDown, LogIn } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { useTranslation } from "react-i18next";

type ModelSelectProps = {
  authLoggedIn: boolean;
  isLoginBusy: boolean;
  candidates: AiModel[];
  selectedModel: AiModel | undefined;
  effectiveModelId: string;
  disabled: boolean;
  modelSelectOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onSelectModel: (modelId: string) => void;
  onOpenLogin: () => void;
};

/** Render the model selector. */
export function ModelSelect({
  authLoggedIn,
  isLoginBusy,
  candidates,
  selectedModel,
  effectiveModelId,
  disabled,
  modelSelectOpen,
  onOpenChange,
  onSelect,
  onSelectModel,
  onOpenLogin,
}: ModelSelectProps) {
  const { t } = useTranslation('board');
  if (!authLoggedIn) {
    return (
      <button
        type="button"
        disabled={isLoginBusy}
        className={[
          "flex h-7 w-full items-center justify-between bg-muted/50 px-3 text-[11px] text-ol-text-auxiliary",
          "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
        ].join(" ")}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
          onOpenLogin();
        }}
      >
        <span className="truncate">{t('videoGenerate.modelSelect.loginHint')}</span>
        <LogIn size={14} />
      </button>
    );
  }

  return (
    <Popover
      open={modelSelectOpen}
      onOpenChange={(open) => {
        if (disabled) return;
        if (candidates.length === 0) {
          onOpenChange(false);
          return;
        }
        onOpenChange(open);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={candidates.length === 0 || disabled}
          className={[
            "flex h-7 w-full items-center justify-between bg-muted/50 px-2 text-[11px] text-ol-text-secondary",
            "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
          ].join(" ")}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <span className="truncate">
            {selectedModel?.name || selectedModel?.id || t('videoGenerate.modelSelect.noModel')}
          </span>
          <ChevronDown size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto border border-border/60 bg-card p-1 text-[11px] text-ol-text-secondary shadow-sm"
      >
        {candidates.length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-ol-text-auxiliary">
            {t('videoGenerate.modelSelect.noModel')}
          </div>
        ) : (
          candidates.map((option) => (
            <button
              key={option.id}
              type="button"
              className={[
                "flex w-full items-center rounded px-2 py-1.5 text-left text-[11px]",
                "hover:bg-ol-surface-muted",
                option.id === effectiveModelId
                  ? "bg-ol-blue-bg-hover text-ol-blue"
                  : "text-ol-text-secondary",
              ].join(" ")}
              onClick={() => {
                onSelectModel(option.id);
                onOpenChange(false);
              }}
            >
              {option.name || option.id}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
