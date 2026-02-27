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

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { ChatCommand } from "@openloaf/api/common";
import { CHAT_COMMANDS } from "@openloaf/api/common";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { buildSkillCommandText } from "./chat-input-utils";
import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
} from "@/components/ai-elements/prompt-input";

type SkillSummary = {
  name: string;
  description: string;
  scope: "workspace" | "project";
  isEnabled: boolean;
};

type SlashMode = "command" | "skill";

type MenuLevel = "root" | "skills";

type MenuItem =
  | {
      kind: "command";
      id: string;
      label: string;
      description?: string;
      command: string;
    }
  | {
      kind: "skill";
      id: string;
      label: string;
      description?: string;
      skillName: string;
    }
  | {
      kind: "group";
      id: string;
      label: string;
      description?: string;
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

/** Root group item for the skill submenu. */
const SKILL_GROUP_ITEM: MenuItem = {
  kind: "group",
  id: "skills-group",
  label: "技能",
  description: "进入技能列表",
};

/** Display labels for skill scopes. */
const SCOPE_LABELS: Record<SkillSummary["scope"], string> = {
  workspace: "工作空间",
  project: "项目",
};

/** Slash trigger for the last token. */
const SLASH_TRIGGER_REGEX = /(^|\s)(\/\S*)$/u;

/** Resolve slash trigger state from current input value. */
function resolveSlashState(value: string): { mode: SlashMode; query: string } | null {
  const match = SLASH_TRIGGER_REGEX.exec(value);
  if (!match) return null;
  const token = match[2] ?? "";
  if (!token.startsWith("/")) return null;
  const firstNonSpaceIndex = value.search(/\S/u);
  if (firstNonSpaceIndex < 0) return null;
  const tokenStartIndex = (match.index ?? 0) + (match[1]?.length ?? 0);
  const mode: SlashMode = tokenStartIndex === firstNonSpaceIndex ? "command" : "skill";
  return { mode, query: token.slice(1) };
}

/** Filter commands by query and map to menu items. */
function filterCommands(commands: ChatCommand[], query: string): MenuItem[] {
  const keyword = query.trim().toLowerCase();
  return commands
    .filter((command) => {
      if (!keyword) return true;
      return (
        command.command.toLowerCase().includes(keyword) ||
        command.title.toLowerCase().includes(keyword) ||
        (command.description ?? "").toLowerCase().includes(keyword)
      );
    })
    .map((command) => ({
      kind: "command" as const,
      id: command.id,
      label: command.command,
      description: command.description,
      command: command.command,
    }));
}

/** Filter skills by query and map to menu items. */
function filterSkills(skills: SkillSummary[], query: string): MenuItem[] {
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
      kind: "skill" as const,
      id: `skill-${skill.name}`,
      label: skill.name,
      description: `${SCOPE_LABELS[skill.scope]} · ${skill.description || "未提供说明"}`,
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

const ChatCommandMenu = forwardRef<ChatCommandMenuHandle, ChatCommandMenuProps>(
  ({ value, onChange, onRequestFocus, isFocused, projectId, className }, ref) => {
    const slashState = resolveSlashState(value);
    const menuMode = slashState?.mode ?? "command";
    const query = slashState?.query ?? "";
    const [menuLevel, setMenuLevel] = useState<MenuLevel>("root");
    const [activeIndex, setActiveIndex] = useState(0);
    const skillsQuery = useQuery(
      projectId
        ? trpc.settings.getSkills.queryOptions({ projectId })
        : trpc.settings.getSkills.queryOptions()
    );
    const skills = (skillsQuery.data ?? []) as SkillSummary[];

    const commandItems = useMemo(
      () => filterCommands(CHAT_COMMANDS, query),
      [query]
    );
    const skillItems = useMemo(() => {
      if (menuMode === "command") return filterSkills(skills, "");
      return filterSkills(skills, query);
    }, [menuMode, skills, query]);
    const rootItems = useMemo(() => {
      if (menuMode === "skill") return skillItems;
      if (skillItems.length === 0) return commandItems;
      return [...commandItems, SKILL_GROUP_ITEM];
    }, [commandItems, menuMode, skillItems]);
    const currentItems =
      menuMode === "command" && menuLevel === "skills" ? skillItems : rootItems;
    const isOpen = Boolean(isFocused && slashState);

    useEffect(() => {
      if (!isOpen) {
        setActiveIndex(0);
        setMenuLevel("root");
        return;
      }
      setActiveIndex(0);
    }, [isOpen, menuLevel, menuMode, query]);

    useEffect(() => {
      if (menuMode === "skill") {
        setMenuLevel("root");
      }
      if (menuMode === "command" && menuLevel === "skills" && skillItems.length === 0) {
        setMenuLevel("root");
      }
    }, [menuMode, menuLevel, skillItems.length]);

    /** Apply the selected menu item. */
    const selectItem = (item: MenuItem) => {
      if (item.kind === "group") {
        setMenuLevel("skills");
        setActiveIndex(0);
        return;
      }
      const replacement =
        item.kind === "command"
          ? item.command
          : buildSkillCommandText(item.skillName);
      onChange(replaceSlashToken(value, replacement));
      onRequestFocus?.();
      setMenuLevel("root");
      setActiveIndex(0);
    };

    /** Handle keyboard navigation for the menu. */
    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (!isOpen) return false;
      if (currentItems.length === 0) return false;
      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % currentItems.length);
          return true;
        }
        case "ArrowUp": {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + currentItems.length) % currentItems.length);
          return true;
        }
        case "ArrowRight": {
          if (menuMode !== "command" || menuLevel !== "root") return false;
          const active = currentItems[activeIndex];
          if (active?.kind !== "group") return false;
          event.preventDefault();
          setMenuLevel("skills");
          setActiveIndex(0);
          return true;
        }
        case "ArrowLeft": {
          if (menuMode !== "command" || menuLevel !== "skills") return false;
          event.preventDefault();
          setMenuLevel("root");
          setActiveIndex(0);
          return true;
        }
        case "Enter": {
          event.preventDefault();
          const item = currentItems[activeIndex];
          if (!item) return true;
          selectItem(item);
          return true;
        }
        default:
          return false;
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        handleKeyDown,
      }),
      [handleKeyDown]
    );

    const headerText =
      menuMode === "command"
        ? menuLevel === "skills"
          ? "技能"
          : "指令"
        : "技能";

    if (!isOpen) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute left-2 bottom-full mb-4 z-20 w-64 rounded-lg border border-border bg-popover shadow-lg",
          className,
        )}
        role="listbox"
        aria-label="Slash menu"
      >
        <PromptInputCommand>
          <PromptInputCommandList className="max-h-56 overflow-y-auto">
            {currentItems.length === 0 ? (
              <PromptInputCommandEmpty>暂无匹配项</PromptInputCommandEmpty>
            ) : (
              <PromptInputCommandGroup heading={headerText}>
                {currentItems.map((item, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <PromptInputCommandItem
                      key={item.id}
                      value={item.label}
                      onSelect={() => selectItem(item)}
                      onMouseDown={(event) => event.preventDefault()}
                      onPointerMove={() => setActiveIndex(index)}
                      className={cn(
                        "flex flex-col gap-0.5 px-2.5 py-2 text-left text-xs",
                        isActive ? "bg-muted/70" : "hover:bg-muted/60",
                      )}
                      aria-selected={isActive}
                    >
                      <span className="text-[12px] font-medium text-foreground">
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className="text-[11px] text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </PromptInputCommandItem>
                  );
                })}
              </PromptInputCommandGroup>
            )}
          </PromptInputCommandList>
        </PromptInputCommand>
      </div>
    );
  }
);

ChatCommandMenu.displayName = "ChatCommandMenu";

export default ChatCommandMenu;
