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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { buildSkillCommandText } from "./chat-input-utils";

type SkillSummary = {
  name: string;
  description: string;
  scope: "global" | "project";
  isEnabled: boolean;
};

type SkillItem = {
  id: string;
  label: string;
  description?: string;
  skillName: string;
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

/** Filter skills by query. */
function filterSkills(
  skills: SkillSummary[],
  query: string,
  scopeLabels: Record<SkillSummary["scope"], string>,
): SkillItem[] {
  const keyword = query.trim().toLowerCase();
  return skills
    .filter((skill) => skill.isEnabled)
    .filter((skill) => {
      if (!keyword) return true;
      return (
        skill.name.toLowerCase().includes(keyword) ||
        skill.description.toLowerCase().includes(keyword)
      );
    })
    .map((skill) => ({
      id: `skill-${skill.name}`,
      label: skill.name,
      description: `${scopeLabels[skill.scope]} · ${skill.description || "未提供说明"}`,
      skillName: skill.name,
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

const MENU_WIDTH = 280;
const MENU_GAP = 8;
const EMPTY_SKILLS: SkillSummary[] = [];

const ChatCommandMenu = forwardRef<ChatCommandMenuHandle, ChatCommandMenuProps>(
  ({ value, onChange, onRequestFocus, isFocused, projectId, className }, ref) => {
    const { t } = useTranslation("ai");
    const { t: tNav } = useTranslation("nav");
    const query = resolveSlashQuery(value);
    const [menuIndexState, setMenuIndexState] = useState<MenuIndexState>({
      key: "",
      index: 0,
    });
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
    const skillsQuery = useQuery({
      ...(projectId
        ? trpc.settings.getSkills.queryOptions({ projectId })
        : trpc.settings.getSkills.queryOptions()),
      staleTime: 5 * 60 * 1000,
    });
    const skills = (skillsQuery.data ?? EMPTY_SKILLS) as SkillSummary[];
    const scopeLabels = useMemo<Record<SkillSummary["scope"], string>>(
      () => ({
        global: t("projectSelector.projectSpace"),
        project: tNav("project"),
      }),
      [t, tNav],
    );

    const items = useMemo(
      () => filterSkills(skills, query ?? "", scopeLabels),
      [skills, query, scopeLabels],
    );
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

    /** Apply the selected skill item. */
    const selectItem = useCallback((item: SkillItem) => {
      onChange(replaceSlashToken(value, buildSkillCommandText(item.skillName)));
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
          "fixed z-50 flex flex-col rounded-lg border border-border bg-popover shadow-lg",
          className,
        )}
        style={{ left: pos.left, bottom: pos.bottom, width: MENU_WIDTH, maxHeight: 320 }}
        role="listbox"
        aria-label="Slash menu"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="shrink-0 px-2.5 py-2 text-xs font-medium text-muted-foreground border-b border-border">
          技能
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
              暂无可用技能
            </div>
          ) : (
            items.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={isActive}
                  className={cn(
                    "flex flex-col gap-0.5 px-2.5 py-2 text-left text-xs cursor-default rounded-sm mx-1",
                    isActive ? "bg-muted/70" : "hover:bg-muted/60",
                  )}
                  onClick={() => selectItem(item)}
                  onPointerMove={() => setMenuActiveIndex(index)}
                >
                  <span className="text-[12px] font-medium text-foreground">
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {item.description}
                    </span>
                  ) : null}
                </div>
              );
            })
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
