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

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Kbd, KbdGroup } from "@openloaf/ui/kbd";
import { GLOBAL_SHORTCUTS } from "@/lib/globalShortcuts";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Calendar,
  Columns2,
  Copy,
  Eraser,
  Group,
  Hand,
  Highlighter,
  Home,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Lock,
  Maximize2,
  MessageSquare,
  MousePointer2,
  Paperclip,
  PenTool,
  Redo2,
  Scissors,
  Search,
  Settings,
  ShieldOff,
  Sparkles,
  PanelLeft,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";

/** Flat-color icon badge for settings items. */
function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

const SHORTCUT_KEYS_MAP: Record<string, string> = {
  "sidebar.toggle": "sidebarToggle",
  "chat.toggle": "chatToggle",
  "search.toggle": "searchToggle",
  "open.calendar": "openCalendar",
  "open.inbox": "openInbox",
  "open.ai": "openAi",
  "settings.open": "settingsOpen",
  "refresh.disable": "refreshDisable",
  "feedback.open": "feedbackOpen",
};

/** Icon and color for each global shortcut. */
const SHORTCUT_ICON_MAP: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  "sidebar.toggle": { icon: PanelLeft, bg: "bg-ol-surface-muted", fg: "text-ol-text-auxiliary" },
  "chat.toggle": { icon: MessageSquare, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
  "search.toggle": { icon: Search, bg: "bg-ol-amber-bg", fg: "text-ol-amber" },
  "open.calendar": { icon: Calendar, bg: "bg-ol-green-bg", fg: "text-ol-green" },
  "open.workbench": { icon: Columns2, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
  "open.ai-assistant": { icon: Bot, bg: "bg-ol-purple-bg", fg: "text-ol-purple" },
  "settings.open": { icon: Settings, bg: "bg-ol-surface-muted", fg: "text-ol-text-auxiliary" },
  "refresh.disable": { icon: ShieldOff, bg: "bg-ol-red-bg", fg: "text-ol-red" },
  "feedback.open": { icon: MessageSquare, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
};

/** Icon and color for each project shortcut. */
const PROJECT_ICON_MAP: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  "project.tab.index": { icon: Home, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
  "project.tab.canvas": { icon: LayoutGrid, bg: "bg-ol-purple-bg", fg: "text-ol-purple" },
  "project.tab.tasks": { icon: ListChecks, bg: "bg-ol-green-bg", fg: "text-ol-green" },
  "project.tab.materials": { icon: Paperclip, bg: "bg-ol-amber-bg", fg: "text-ol-amber" },
  "project.tab.skills": { icon: Wand2, bg: "bg-ol-red-bg", fg: "text-ol-red" },
};

/** Icon and color for each canvas shortcut. */
const CANVAS_ICON_MAP: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  "canvas.select": { icon: MousePointer2, bg: "bg-ol-surface-muted", fg: "text-ol-text-auxiliary" },
  "canvas.hand": { icon: Hand, bg: "bg-ol-amber-bg", fg: "text-ol-amber" },
  "canvas.pen": { icon: PenTool, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
  "canvas.highlighter": { icon: Highlighter, bg: "bg-ol-amber-bg", fg: "text-ol-amber" },
  "canvas.eraser": { icon: Eraser, bg: "bg-ol-red-bg", fg: "text-ol-red" },
  "canvas.fitToScreen": { icon: Maximize2, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
  "canvas.lock": { icon: Lock, bg: "bg-ol-amber-bg", fg: "text-ol-amber" },
  "canvas.autoLayout": { icon: LayoutDashboard, bg: "bg-ol-purple-bg", fg: "text-ol-purple" },
  "canvas.undo": { icon: Undo2, bg: "bg-ol-blue-bg", fg: "text-ol-blue" },
  "canvas.redo": { icon: Redo2, bg: "bg-ol-green-bg", fg: "text-ol-green" },
  "canvas.copy": { icon: Copy, bg: "bg-ol-green-bg", fg: "text-ol-green" },
  "canvas.cut": { icon: Scissors, bg: "bg-ol-purple-bg", fg: "text-ol-purple" },
  "canvas.group": { icon: Group, bg: "bg-ol-purple-bg", fg: "text-ol-purple" },
  "canvas.delete": { icon: Trash2, bg: "bg-ol-red-bg", fg: "text-ol-red" },
};

const DEFAULT_ICON = { icon: Sparkles, bg: "bg-ol-surface-muted", fg: "text-ol-text-auxiliary" };

/** Returns the localized label for a shortcut, falling back to the original text. */
function getShortcutLabel(
  input: { id: string; label: string },
  t: (key: string) => string,
) {
  const keyPath = SHORTCUT_KEYS_MAP[input.id];
  return keyPath ? t(`keyboardShortcuts.${keyPath}`) : input.label;
}

function useIsMac() {
  return useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    [],
  );
}

function renderKeysPart(part: string, isMac: boolean) {
  if (part === "Mod") return isMac ? "⌘" : "Ctrl";
  if (part === "Cmd") return "⌘";
  if (part === "Ctrl") return "Ctrl";
  if (part === "Alt") return isMac ? "⌥" : "Alt";
  if (/^[a-z]$/i.test(part)) return part.toUpperCase();
  return part;
}

function ShortcutKeys({ keys, isMac }: { keys: string; isMac: boolean }) {
  const alternatives = keys
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {alternatives.map((alt, altIndex) => {
        const parts = alt
          .split("+")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => renderKeysPart(item, isMac));

        return (
          <div key={`${alt}-${altIndex}`} className="flex items-center gap-2">
            <KbdGroup className="gap-1">
              {parts.map((part, partIndex) => (
                <Kbd
                  key={`${part}-${partIndex}`}
                  className="bg-transparent px-0 h-auto rounded-none"
                >
                  {part}
                </Kbd>
              ))}
            </KbdGroup>
            {altIndex < alternatives.length - 1 ? (
              <span className="text-xs">/</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function KeyboardShortcuts() {
  const { t } = useTranslation('settings');
  const isMac = useIsMac();

  const PROJECT_SHORTCUTS = useMemo(() => [
    { id: "project.tab.index", label: t('keyboardShortcuts.projectTabIndex'), keys: "Alt+1" },
    { id: "project.tab.canvas", label: t('keyboardShortcuts.projectTabCanvas'), keys: "Alt+2" },
    { id: "project.tab.tasks", label: t('keyboardShortcuts.projectTabTasks'), keys: "Alt+3" },
    { id: "project.tab.materials", label: t('keyboardShortcuts.projectTabMaterials'), keys: "Alt+4" },
    { id: "project.tab.skills", label: t('keyboardShortcuts.projectTabSkills'), keys: "Alt+5" },
  ], [t]);

  const CANVAS_SHORTCUTS = useMemo(() => [
    { id: "canvas.select", label: t('keyboardShortcuts.canvasSelect'), keys: "A" },
    { id: "canvas.hand", label: t('keyboardShortcuts.canvasHand'), keys: "W" },
    { id: "canvas.pen", label: t('keyboardShortcuts.canvasPen'), keys: "P" },
    { id: "canvas.highlighter", label: t('keyboardShortcuts.canvasHighlighter'), keys: "K" },
    { id: "canvas.eraser", label: t('keyboardShortcuts.canvasEraser'), keys: "E" },
    { id: "canvas.fitToScreen", label: t('keyboardShortcuts.canvasFitToScreen'), keys: "F" },
    { id: "canvas.lock", label: t('keyboardShortcuts.canvasLock'), keys: "L" },
    { id: "canvas.autoLayout", label: t('keyboardShortcuts.canvasAutoLayout'), keys: "Ctrl+Shift+L" },
    { id: "canvas.undo", label: t('keyboardShortcuts.canvasUndo'), keys: "Mod+Z" },
    { id: "canvas.redo", label: t('keyboardShortcuts.canvasRedo'), keys: "Mod+Y / Mod+Shift+Z" },
    { id: "canvas.copy", label: t('keyboardShortcuts.canvasCopy'), keys: "Mod+C" },
    { id: "canvas.cut", label: t('keyboardShortcuts.canvasCut'), keys: "Mod+X" },
    { id: "canvas.group", label: t('keyboardShortcuts.canvasGroup'), keys: "Mod+G" },
    { id: "canvas.delete", label: t('keyboardShortcuts.canvasDelete'), keys: "Delete / Backspace" },
  ], [t]);

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title={t('keyboardShortcuts.globalShortcuts')}>
        <div className="divide-y divide-border/40">
          {GLOBAL_SHORTCUTS.map((shortcut) => {
            const label = getShortcutLabel(shortcut, (key) => t(key));
            const iconDef = SHORTCUT_ICON_MAP[shortcut.id] ?? DEFAULT_ICON;
            return (
              <div
                key={shortcut.id}
                className="flex flex-wrap items-center gap-2 py-3"
              >
                <SettingIcon icon={iconDef.icon} bg={iconDef.bg} fg={iconDef.fg} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{label}</div>
                </div>
                <OpenLoafSettingsField className="shrink-0">
                  <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
                </OpenLoafSettingsField>
              </div>
            );
          })}
        </div>
      </OpenLoafSettingsGroup>
      <OpenLoafSettingsGroup title={t('keyboardShortcuts.projectShortcuts')}>
        <div className="divide-y divide-border/40">
          {PROJECT_SHORTCUTS.map((shortcut) => {
            const iconDef = PROJECT_ICON_MAP[shortcut.id] ?? DEFAULT_ICON;
            return (
              <div
                key={shortcut.id}
                className="flex flex-wrap items-center gap-2 py-3"
              >
                <SettingIcon icon={iconDef.icon} bg={iconDef.bg} fg={iconDef.fg} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{shortcut.label}</div>
                </div>
                <OpenLoafSettingsField className="shrink-0">
                  <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
                </OpenLoafSettingsField>
              </div>
            );
          })}
        </div>
      </OpenLoafSettingsGroup>
      <OpenLoafSettingsGroup title={t('keyboardShortcuts.canvasShortcuts')}>
        <div className="divide-y divide-border/40">
          {CANVAS_SHORTCUTS.map((shortcut) => {
            const iconDef = CANVAS_ICON_MAP[shortcut.id] ?? DEFAULT_ICON;
            return (
              <div
                key={shortcut.id}
                className="flex flex-wrap items-center gap-2 py-3"
              >
                <SettingIcon icon={iconDef.icon} bg={iconDef.bg} fg={iconDef.fg} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{shortcut.label}</div>
                </div>
                <OpenLoafSettingsField className="shrink-0">
                  <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
                </OpenLoafSettingsField>
              </div>
            );
          })}
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
}
