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
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";

type MentionItem = {
  id: string;
  label: string;
  icon?: string;
  projectId: string;
  agentType: "pm";
};

export type SelectedAgent = {
  projectId: string;
  projectTitle: string;
  agentType: "pm";
};

export type ChatAgentMentionHandle = {
  handleKeyDown: (event: React.KeyboardEvent) => boolean;
};

type ChatAgentMentionProps = {
  value: string;
  onChange: (value: string) => void;
  onAgentSelect?: (agent: SelectedAgent | null) => void;
  onRequestFocus?: () => void;
  isFocused: boolean;
  className?: string;
};

/** Trigger: standalone @ at the end (or @agents/...). */
const AT_TRIGGER_REGEX = /(^|\s)@(\S*)$/u;

const MENU_WIDTH = 280;
const MENU_GAP = 8;

type MenuIndexState = {
  key: string;
  index: number;
};

/** Resolve query text after @ from current input value. */
function resolveAtQuery(value: string): string | null {
  const match = value.match(AT_TRIGGER_REGEX);
  if (!match) return null;
  return match[2] ?? "";
}

/** Strip `agents/` prefix if present to get the project search query. */
function extractProjectQuery(raw: string): string {
  if (raw.startsWith("agents/")) {
    const rest = raw.slice(7);
    const slashIdx = rest.indexOf("/");
    return slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  }
  return raw;
}

const ChatAgentMention = forwardRef<ChatAgentMentionHandle, ChatAgentMentionProps>(
  function ChatAgentMention(
    { value, onChange, onAgentSelect, onRequestFocus, isFocused, className },
    ref,
  ) {
    const [menuIndexState, setMenuIndexState] = useState<MenuIndexState>({
      key: "",
      index: 0,
    });
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

    const atQuery = useMemo(() => (isFocused ? resolveAtQuery(value) : null), [value, isFocused]);
    const isOpen = Boolean(isFocused && atQuery !== null);
    const menuIndexKey = `${isOpen ? "open" : "closed"}:${atQuery ?? ""}`;
    const activeIndex =
      menuIndexState.key === menuIndexKey ? menuIndexState.index : 0;

    const { data: projects } = useProjects({ enabled: isOpen });

    const items: MentionItem[] = useMemo(() => {
      if (!projects || projects.length === 0) return [];
      const query = extractProjectQuery(atQuery ?? "").toLowerCase();
      return projects
        .filter((p) => {
          if (!query) return true;
          const title = (p.title ?? "").toLowerCase();
          return title.includes(query);
        })
        .map((p) => ({
          id: p.projectId,
          label: p.title ?? p.projectId,
          icon: p.icon ?? undefined,
          projectId: p.projectId,
          agentType: "pm" as const,
        }));
    }, [projects, atQuery]);

    // Compute fixed position relative to the parent input container.
    const updatePosition = useCallback(() => {
      const anchor = menuRef.current?.closest(".openloaf-thinking-border") ??
        menuRef.current?.parentElement;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPos({
        left: rect.left,
        bottom: window.innerHeight - rect.top + MENU_GAP,
      });
    }, []);

    useLayoutEffect(() => {
      if (!isOpen) return;
      const frameId = window.requestAnimationFrame(updatePosition);
      return () => window.cancelAnimationFrame(frameId);
    }, [isOpen, updatePosition]);

    const setMenuActiveIndex = useCallback(
      (nextIndex: number | ((currentIndex: number) => number)) => {
        setMenuIndexState((current) => {
          const currentIndex =
            current.key === menuIndexKey ? current.index : 0;
          return {
            key: menuIndexKey,
            index:
              typeof nextIndex === "function"
                ? nextIndex(currentIndex)
                : nextIndex,
          };
        });
      },
      [menuIndexKey],
    );

    const selectItem = useCallback(
      (item: MentionItem) => {
        const mention = `@agents/${item.label}/pm `;
        const newValue = value.replace(AT_TRIGGER_REGEX, `$1${mention}`);
        onChange(newValue);
        onAgentSelect?.({
          projectId: item.projectId,
          projectTitle: item.label,
          agentType: "pm",
        });
        onRequestFocus?.();
        setMenuActiveIndex(0);
      },
      [value, onChange, onAgentSelect, onRequestFocus, setMenuActiveIndex],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (!isOpen) return false;
        if (items.length === 0) return false;
        switch (event.key) {
          case "ArrowDown": {
            event.preventDefault();
            setMenuActiveIndex((prev) => (prev + 1) % items.length);
            return true;
          }
          case "ArrowUp": {
            event.preventDefault();
            setMenuActiveIndex((prev) => (prev - 1 + items.length) % items.length);
            return true;
          }
          case "Tab":
          case "Enter": {
            const item = items[activeIndex];
            if (!item) return false;
            event.preventDefault();
            selectItem(item);
            return true;
          }
          case "Escape": {
            event.preventDefault();
            const newValue = value.replace(AT_TRIGGER_REGEX, "$1");
            onChange(newValue);
            onAgentSelect?.(null);
            return true;
          }
          default:
            return false;
        }
      },
      [
        isOpen,
        items,
        activeIndex,
        selectItem,
        value,
        onChange,
        onAgentSelect,
        setMenuActiveIndex,
      ],
    );

    useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

    // Hidden anchor for position calculation.
    const anchor = <span ref={menuRef} className="hidden" />;

    if (!isOpen || !pos || items.length === 0) {
      return anchor;
    }

    const menu = (
      <div
        className={cn(
          "fixed z-50 flex flex-col rounded-lg border border-border bg-popover shadow-lg",
          className,
        )}
        style={{ left: pos.left, bottom: pos.bottom, width: MENU_WIDTH, maxHeight: 320 }}
        role="listbox"
        aria-label="Agent mention menu"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="shrink-0 px-2.5 py-2 text-xs font-medium text-muted-foreground border-b border-border">
          选择项目 → 管理员
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isActive}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 text-left text-xs cursor-default rounded-sm mx-1",
                  isActive ? "bg-muted/70" : "hover:bg-muted/60",
                )}
                onClick={() => selectItem(item)}
                onPointerMove={() => setMenuActiveIndex(index)}
              >
                {item.icon ? (
                  <span className="size-4 text-center shrink-0">{item.icon}</span>
                ) : (
                  <Bot className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-[12px] font-medium text-foreground truncate">
                  {item.label}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground shrink-0">管理员</span>
              </div>
            );
          })}
        </div>
      </div>
    );

    return (
      <>
        {anchor}
        {createPortal(menu, document.body)}
      </>
    );
  },
);

ChatAgentMention.displayName = "ChatAgentMention";

export default ChatAgentMention;
