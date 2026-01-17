"use client";

import * as React from "react";
import type { ChatCommand } from "@tenas-ai/api/common";
import { CHAT_COMMANDS } from "@tenas-ai/api/common";
import { cn } from "@/lib/utils";

const COMMAND_TRIGGER_REGEX = /(^|\s)(\/[\w-]*)$/;

/** Extract trailing command query from the input value. */
function getCommandQuery(value: string): string | null {
  const match = value.match(COMMAND_TRIGGER_REGEX);
  return match?.[2] ?? null;
}

/** Replace trailing command token with the selected command. */
function replaceTrailingCommand(value: string, command: string): string {
  const next = value.replace(COMMAND_TRIGGER_REGEX, (_match, lead) => `${lead}${command}`);
  return next.endsWith(" ") ? next : `${next} `;
}

/** Render slash command menu for the chat input. */
export default function ChatCommandMenu({
  value,
  onChange,
  onRequestFocus,
  isFocused,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onRequestFocus?: () => void;
  isFocused: boolean;
  className?: string;
}) {
  const query = getCommandQuery(value);
  const candidates = React.useMemo(() => {
    if (!query) return [] as ChatCommand[];
    return CHAT_COMMANDS.filter((command) => command.command.startsWith(query));
  }, [query]);

  if (!isFocused || !query || candidates.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-2 bottom-12 z-20 w-64 rounded-lg border border-border bg-popover shadow-lg",
        className,
      )}
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
        Commands
      </div>
      <div className="max-h-48 overflow-y-auto">
        {candidates.map((command) => (
          <button
            key={command.id}
            type="button"
            className="flex w-full flex-col gap-0.5 px-2.5 py-2 text-left text-xs hover:bg-muted/60"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const nextValue = replaceTrailingCommand(value, command.command);
              onChange(nextValue);
              onRequestFocus?.();
            }}
            role="option"
          >
            <span className="text-[12px] font-medium text-foreground">
              {command.command}
            </span>
            {command.description ? (
              <span className="text-[11px] text-muted-foreground">
                {command.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
