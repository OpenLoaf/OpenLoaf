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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

type AgentItem = {
  id: string;
  label: string;
  description?: string;
  agentName: string;
  taskId?: string;
  projectTitle?: string;
};

export type ChatAgentMentionHandle = {
  handleKeyDown: (event: React.KeyboardEvent) => boolean;
};

type ChatAgentMentionProps = {
  value: string;
  onChange: (value: string) => void;
  onRequestFocus?: () => void;
  isFocused: boolean;
  sessionId?: string;
  className?: string;
};

/** @agents/ trigger pattern. */
const AGENT_TRIGGER_REGEX = /(^|\s)(@agents\/\S*)$/u;

/** Resolve @agents/ query from current input value. */
function resolveAgentQuery(value: string): string | null {
  const match = value.match(AGENT_TRIGGER_REGEX);
  if (!match) return null;
  const raw = match[2];
  if (!raw) return null;
  // Extract the agent name query after @agents/
  return raw.slice(8); // Remove "@agents/"
}

const ChatAgentMention = forwardRef<ChatAgentMentionHandle, ChatAgentMentionProps>(
  function ChatAgentMention(
    { value, onChange, onRequestFocus, isFocused, sessionId, className },
    ref,
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);

    const agentQuery = useMemo(() => (isFocused ? resolveAgentQuery(value) : null), [value, isFocused]);
    const isOpen = agentQuery !== null;

    // Query active tasks for this session to get available agents
    const tasksQuery = useQuery({
      ...trpc.chat.listSidebarSessions.queryOptions({
        limit: 20,
      }),
      enabled: isOpen,
      staleTime: 10_000,
    });

    // Build agent items from active tasks
    const items: AgentItem[] = useMemo(() => {
      // Default agents always available
      const defaults: AgentItem[] = [
        { id: 'pm', label: 'PM', description: '项目经理', agentName: 'pm' },
      ];

      if (!agentQuery) return defaults;

      const query = agentQuery.toLowerCase();
      return defaults.filter(
        (item) =>
          item.agentName.toLowerCase().includes(query) ||
          (item.description?.toLowerCase().includes(query) ?? false),
      );
    }, [agentQuery]);

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items.length]);

    const selectItem = useCallback(
      (item: AgentItem) => {
        // Replace the @agents/... prefix with the completed mention
        const mention = `@agents/${item.agentName} `;
        const newValue = value.replace(AGENT_TRIGGER_REGEX, `$1${mention}`);
        onChange(newValue);
        onRequestFocus?.();
      },
      [value, onChange, onRequestFocus],
    );

    useImperativeHandle(
      ref,
      () => ({
        handleKeyDown(event: React.KeyboardEvent) {
          if (!isOpen || items.length === 0) return false;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % items.length);
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
            return true;
          }
          if (event.key === "Tab" || event.key === "Enter") {
            if (items[selectedIndex]) {
              event.preventDefault();
              selectItem(items[selectedIndex]);
              return true;
            }
          }
          if (event.key === "Escape") {
            event.preventDefault();
            // Clear the @agents/ prefix
            const newValue = value.replace(AGENT_TRIGGER_REGEX, "$1");
            onChange(newValue);
            return true;
          }
          return false;
        },
      }),
      [isOpen, items, selectedIndex, selectItem, value, onChange],
    );

    if (!isOpen || items.length === 0) return null;

    return createPortal(
      <div
        ref={menuRef}
        className={cn(
          "fixed bottom-20 left-1/2 z-50 -translate-x-1/2",
          "w-64 rounded-lg border bg-popover shadow-md",
          className,
        )}
      >
        <div className="p-1">
          <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase">
            Agents
          </div>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onClick={() => selectItem(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Bot className="size-4 text-muted-foreground" />
              <span className="font-medium">{item.label}</span>
              {item.description && (
                <span className="truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );
  },
);

export default ChatAgentMention;
