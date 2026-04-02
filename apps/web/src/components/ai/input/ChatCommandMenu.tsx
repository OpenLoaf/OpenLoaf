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
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { FolderOpen, Globe, Terminal } from "lucide-react";
import { CHAT_COMMANDS } from "@openloaf/api/common/chatCommands";
import { cn } from "@/lib/utils";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { buildSkillCommandText } from "./chat-input-utils";

type SkillSummary = {
  name: string;
  originalName: string;
  description: string;
  scope: "global" | "project";
  isEnabled: boolean;
};

type MenuItem = {
  id: string;
  /** Display label (translated name). */
  label: string;
  description?: string;
  /** Original name from SKILL.md (used for matching/loading). */
  originalName: string;
  /** Display name (may differ from originalName when translated). */
  displayName: string;
  scope: SkillSummary["scope"] | "command";
  /** Slash command token (only for command items). */
  commandToken?: string;
};

type MenuIndexState = {
  key: string;
  index: number;
};

export type ChatCommandMenuHandle = {
  handleKeyDown: (event: React.KeyboardEvent) => boolean;
};

type ChatCommandMenuProps = {
  value: string;
  onChange: (value: string) => void;
  onRequestFocus?: () => void;
  isFocused: boolean;
  projectId?: string;
  className?: string;
  /** Number of assistant (AI) messages in the conversation. Commands like
   *  "compact" are hidden when this is below a threshold (< 2). */
  assistantMessageCount?: number;
};

/** Slash trigger for the last token. */
const SLASH_TRIGGER_REGEX = /(^|\s)(\/\S*)$/u;

/** Resolve slash query from current input value. */
function resolveSlashQuery(value: string): string | null {
  const match = SLASH_TRIGGER_REGEX.exec(value);
  if (!match) return null;
  const token = match[2] ?? "";
  if (!token.startsWith("/")) return null;
  return token.slice(1);
}

/** Command display names (zh-CN). */
const COMMAND_LABELS: Record<string, { title: string; description: string }> = {
  compact: {
    title: "压缩上下文",
    description: "压缩对话历史，释放 token 空间以继续更长的对话",
  },
};

/** Commands that require a minimum number of assistant messages to be shown. */
const COMMAND_MIN_MESSAGES: Record<string, number> = {
  compact: 2,
};

/** Build command menu items from CHAT_COMMANDS. */
function buildCommandItems(query: string, assistantMessageCount = Number.POSITIVE_INFINITY): MenuItem[] {
  const keyword = query.trim().toLowerCase();
  return CHAT_COMMANDS
    .filter((cmd) => cmd.showInMenu)
    .filter((cmd) => assistantMessageCount >= (COMMAND_MIN_MESSAGES[cmd.id] ?? 0))
    .filter((cmd) => {
      if (!keyword) return true;
      const labels = COMMAND_LABELS[cmd.id];
      return (
        cmd.id.includes(keyword) ||
        cmd.command.includes(keyword) ||
        (labels?.title.toLowerCase().includes(keyword) ?? false)
      );
    })
    .map((cmd) => {
      const labels = COMMAND_LABELS[cmd.id];
      return {
        id: `command-${cmd.id}`,
        label: labels?.title ?? cmd.title,
        description: labels?.description ?? cmd.description,
        originalName: cmd.id,
        displayName: labels?.title ?? cmd.title,
        scope: "command" as const,
        commandToken: cmd.command,
      };
    });
}

/** Filter skills by query. */
function filterSkills(
  skills: SkillSummary[],
  query: string,
): MenuItem[] {
  const keyword = query.trim().toLowerCase();
  return skills
    .filter((skill) => skill.isEnabled)
    .filter((skill) => {
      if (!keyword) return true;
      return (
        skill.name.toLowerCase().includes(keyword) ||
        skill.originalName.toLowerCase().includes(keyword) ||
        skill.description.toLowerCase().includes(keyword)
      );
    })
    .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "global" ? -1 : 1))
    .map((skill) => ({
      id: `skill-${skill.scope}-${skill.originalName}`,
      label: skill.name,
      description: skill.description || "未提供说明",
      originalName: skill.originalName,
      displayName: skill.name,
      scope: skill.scope,
    }));
}

/** Replace the current slash token with the selected value. */
function replaceSlashToken(input: string, replacement: string): string {
  const match = SLASH_TRIGGER_REGEX.exec(input);
  if (!match) return input;
  const token = match[2] ?? "";
  const tokenStartIndex = (match.index ?? 0) + (match[1]?.length ?? 0);
  const before = input.slice(0, tokenStartIndex);
  const after = input.slice(tokenStartIndex + token.length);
  const next = `${before}${replacement}${after}`;
  return next.endsWith(" ") ? next : `${next} `;
}

const MENU_WIDTH = 360;
const MENU_GAP = 8;
const EMPTY_SKILLS: SkillSummary[] = [];

function SkillMenuItem({
  item,
  isActive,
  onClick,
  onPointerMove,
}: {
  item: MenuItem;
  isActive: boolean;
  onClick: () => void;
  onPointerMove: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isActive}
      className={cn(
        "flex flex-col gap-0.5 px-2.5 py-2 text-left text-xs cursor-default rounded-3xl mx-1",
        isActive ? "bg-muted/70" : "hover:bg-muted/60",
      )}
      onClick={onClick}
      onPointerMove={onPointerMove}
    >
      <span className="text-[12px] font-medium text-foreground">
        {item.label}
        {item.originalName !== item.label && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            {item.originalName}
          </span>
        )}
      </span>
      {item.description ? (
        <span className="text-[11px] text-muted-foreground truncate">
          {item.description}
        </span>
      ) : null}
    </div>
  );
}

const ChatCommandMenu = forwardRef<ChatCommandMenuHandle, ChatCommandMenuProps>(
  ({ value, onChange, onRequestFocus, isFocused, projectId, className, assistantMessageCount }, ref) => {
    const { t } = useTranslation("ai");
    const { t: tNav } = useTranslation("nav");
    const query = resolveSlashQuery(value);
    const [menuIndexState, setMenuIndexState] = useState<MenuIndexState>({
      key: "",
      index: 0,
    });
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
    const isTabActive = useTabActive();
    const skillsQuery = useQuery({
      ...(projectId
        ? trpc.settings.getSkills.queryOptions({ projectId })
        : trpc.settings.getSkills.queryOptions()),
      staleTime: 5 * 60 * 1000,
      enabled: isTabActive,
    });
    const skills = (skillsQuery.data ?? EMPTY_SKILLS) as SkillSummary[];

    const commandItems = useMemo(
      () => buildCommandItems(query ?? "", assistantMessageCount),
      [query, assistantMessageCount],
    );
    const skillItems = useMemo(
      () => filterSkills(skills, query ?? ""),
      [skills, query],
    );
    const items = useMemo(
      () => [...commandItems, ...skillItems],
      [commandItems, skillItems],
    );
    const globalItems = useMemo(() => skillItems.filter((i) => i.scope === "global"), [skillItems]);
    const projectItems = useMemo(() => skillItems.filter((i) => i.scope === "project"), [skillItems]);
    const isOpen = Boolean(isFocused && query !== null);
    const menuIndexKey = `${isOpen ? "open" : "closed"}:${query ?? ""}`;
    const activeIndex =
      menuIndexState.key === menuIndexKey ? menuIndexState.index : 0;

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

    /** Apply the selected menu item. */
    const selectItem = useCallback((item: MenuItem) => {
      const replacement = item.commandToken
        ? item.commandToken
        : buildSkillCommandText(item.originalName, item.displayName);
      onChange(replaceSlashToken(value, replacement));
      onRequestFocus?.();
      setMenuActiveIndex(0);
    }, [onChange, onRequestFocus, setMenuActiveIndex, value]);

    /** Handle keyboard navigation for the menu. */
    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
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
        case "Enter": {
          event.preventDefault();
          const item = items[activeIndex];
          if (!item) return true;
          selectItem(item);
          return true;
        }
        default:
          return false;
      }
    }, [activeIndex, isOpen, items, selectItem, setMenuActiveIndex]);

    useImperativeHandle(
      ref,
      () => ({
        handleKeyDown,
      }),
      [handleKeyDown],
    );

    // Hidden anchor for position calculation.
    const anchor = <span ref={menuRef} className="hidden" />;

    if (!isOpen || !pos) {
      return anchor;
    }

    const menu = (
      <div
        className={cn(
          "fixed z-50 flex flex-col rounded-3xl border border-border bg-popover shadow-none",
          className,
        )}
        style={{ left: pos.left, bottom: pos.bottom, width: MENU_WIDTH, maxHeight: 320 }}
        role="listbox"
        aria-label="Slash menu"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
              {t("projectSelector.noResults", "无匹配结果")}
            </div>
          ) : (
            <>
              {commandItems.length > 0 && (
                <>
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground bg-popover">
                    <Terminal className="size-3" />
                    {t("slashMenu.commands", "命令")}
                  </div>
                  {commandItems.map((item, i) => {
                    const isActive = i === activeIndex;
                    return (
                      <SkillMenuItem
                        key={item.id}
                        item={item}
                        isActive={isActive}
                        onClick={() => selectItem(item)}
                        onPointerMove={() => setMenuActiveIndex(i)}
                      />
                    );
                  })}
                </>
              )}
              {globalItems.length > 0 && (
                <>
                  {commandItems.length > 0 && (
                    <div className="mx-2.5 my-1 border-t border-border" />
                  )}
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground bg-popover">
                    <Globe className="size-3" />
                    {t("projectSelector.projectSpace")}
                  </div>
                  {globalItems.map((item, i) => {
                    const flatIndex = commandItems.length + i;
                    const isActive = flatIndex === activeIndex;
                    return (
                      <SkillMenuItem
                        key={item.id}
                        item={item}
                        isActive={isActive}
                        onClick={() => selectItem(item)}
                        onPointerMove={() => setMenuActiveIndex(flatIndex)}
                      />
                    );
                  })}
                </>
              )}
              {projectItems.length > 0 && (
                <>
                  {(commandItems.length > 0 || globalItems.length > 0) && (
                    <div className="mx-2.5 my-1 border-t border-border" />
                  )}
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground bg-popover">
                    <FolderOpen className="size-3" />
                    {tNav("project")}
                  </div>
                  {projectItems.map((item, i) => {
                    const flatIndex = commandItems.length + globalItems.length + i;
                    const isActive = flatIndex === activeIndex;
                    return (
                      <SkillMenuItem
                        key={item.id}
                        item={item}
                        isActive={isActive}
                        onClick={() => selectItem(item)}
                        onPointerMove={() => setMenuActiveIndex(flatIndex)}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    );

    return (
      <>
        {anchor}
        {createPortal(menu, document.body)}
      </>
    );
  }
);

ChatCommandMenu.displayName = "ChatCommandMenu";

export default ChatCommandMenu;
