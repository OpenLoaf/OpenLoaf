"use client";

import * as React from "react";
import { Brain, Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from "@/components/ai-elements/prompt-input";

export type ThinkingMode = "fast" | "deep";

interface ThinkingModeSelectorProps {
  value: ThinkingMode;
  onChange: (value: ThinkingMode) => void;
  disabled?: boolean;
  className?: string;
}

/** Select reasoning mode with ai-elements action menu primitives. */
export default function ThinkingModeSelector({
  value,
  onChange,
  disabled,
  className,
}: ThinkingModeSelectorProps) {
  const isDeep = value === "deep";
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        className={cn(
          "h-8 w-8 rounded-full transition-colors",
          isDeep
            ? "bg-violet-500/12 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
            : "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
          className,
        )}
        aria-label={isDeep ? "深度思考模式" : "快速模式"}
      >
        {isDeep ? <Brain className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent className="w-44">
        <PromptInputActionMenuItem onSelect={() => onChange("fast")}>
          <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          快速模式
          {value === "fast" ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
        </PromptInputActionMenuItem>
        <PromptInputActionMenuItem onSelect={() => onChange("deep")}>
          <Brain className="h-4 w-4 text-violet-600 dark:text-violet-300" />
          深度思考
          {value === "deep" ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
        </PromptInputActionMenuItem>
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
}
