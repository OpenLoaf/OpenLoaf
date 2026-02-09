"use client";

import type { MediaModelDefinition } from "@tenas-ai/api/common";
import { ChevronDown, LogIn } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";

type ModelSelectProps = {
  authLoggedIn: boolean;
  isLoginBusy: boolean;
  candidates: MediaModelDefinition[];
  selectedModel: MediaModelDefinition | undefined;
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
          "flex h-9 w-full items-center justify-between rounded-md border border-slate-200/80 bg-slate-50/90 px-3 text-[13px] text-slate-500",
          "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60",
          "dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800",
        ].join(" ")}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
          onOpenLogin();
        }}
      >
        <span className="truncate">登录Teanas账户，使用云端模型后选择模型</span>
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
            "flex h-7 w-full items-center justify-between rounded-md border border-slate-200/80 bg-white/90 px-2 text-[11px] text-slate-600",
            "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60",
            "dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800",
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
        className="w-[var(--radix-popover-trigger-width)] max-h-40 overflow-auto rounded-md border border-slate-200/80 bg-white p-1 text-[11px] text-slate-700 shadow-none backdrop-blur-none dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100"
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
                "hover:bg-slate-100 dark:hover:bg-slate-800",
                option.id === effectiveModelId
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
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
