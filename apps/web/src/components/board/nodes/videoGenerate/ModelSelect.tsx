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
  if (!authLoggedIn) {
    return (
      <button
        type="button"
        disabled={isLoginBusy}
        className={[
          "flex h-9 w-full items-center justify-between rounded-full bg-[#edf2fa] px-3 text-[13px] text-slate-500",
          "hover:bg-[#d2e3fc] disabled:cursor-not-allowed disabled:opacity-60",
          "dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-300 dark:hover:bg-[hsl(var(--muted)/0.5)]",
        ].join(" ")}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
          onOpenLogin();
        }}
      >
        <span className="truncate">登录OpenLoaf账户，使用云端模型后选择模型</span>
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
            "flex h-7 w-full items-center justify-between rounded-full bg-[#edf2fa] border-transparent px-2 text-[11px] text-slate-600",
            "hover:bg-[#d2e3fc] disabled:cursor-not-allowed disabled:opacity-60",
            "dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-200 dark:hover:bg-[hsl(var(--muted)/0.5)]",
          ].join(" ")}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <span className="truncate">
            {selectedModel?.name || selectedModel?.id || "无可用模型"}
          </span>
          <ChevronDown size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto rounded-md border border-[#e3e8ef] bg-white p-1 text-[11px] text-slate-700 shadow-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {candidates.length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            无可用模型
          </div>
        ) : (
          candidates.map((option) => (
            <button
              key={option.id}
              type="button"
              className={[
                "flex w-full items-center rounded px-2 py-1.5 text-left text-[11px]",
                "hover:bg-[#f1f3f4] dark:hover:bg-slate-800",
                option.id === effectiveModelId
                  ? "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50"
                  : "text-slate-700 dark:text-slate-200",
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
