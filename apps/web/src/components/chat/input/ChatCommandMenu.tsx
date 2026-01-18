"use client";

import type { ChatCommand } from "@tenas-ai/api/common";
import { cn } from "@/lib/utils";

/** Render slash command menu for the chat input. */
export default function ChatCommandMenu({
  open,
  commands,
  activeIndex,
  onSelect,
  onHighlight,
  className,
}: {
  open: boolean;
  commands: ChatCommand[];
  activeIndex: number;
  onSelect: (command: ChatCommand) => void;
  onHighlight?: (index: number) => void;
  className?: string;
}) {
  if (!open || commands.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-2 bottom-full mb-2 z-20 w-64 rounded-lg border border-border bg-popover shadow-lg",
        className,
      )}
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
        Commands
      </div>
      <div className="max-h-48 overflow-y-auto">
        {commands.map((command, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={command.id}
              type="button"
              className={cn(
                "flex w-full flex-col gap-0.5 px-2.5 py-2 text-left text-xs",
                isActive ? "bg-muted/70" : "hover:bg-muted/60",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => onHighlight?.(index)}
              onClick={() => onSelect(command)}
              role="option"
              aria-selected={isActive}
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
          );
        })}
      </div>
    </div>
  );
}
