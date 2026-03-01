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

const SHORTCUT_KEYS_MAP: Record<string, string> = {
  "sidebar.toggle": "sidebarToggle",
  "chat.toggle": "chatToggle",
  "search.toggle": "searchToggle",
  "open.calendar": "openCalendar",
  "open.inbox": "openInbox",
  "open.ai": "openAi",
  "open.template": "openTemplate",
  "tab.new": "tabNew",
  "tab.switch": "tabSwitch",
  "tab.close": "tabClose",
  "settings.open": "settingsOpen",
  "refresh.disable": "refreshDisable",
};

const SHORTCUT_NOTE_KEYS_MAP: Record<string, string> = {
  "settings.open": "settingsOpenNote",
  "refresh.disable": "refreshDisableNote",
};

const PROJECT_SHORTCUT_KEYS = [
  "projectTabIndex",
  "projectTabCanvas",
  "projectTabTasks",
  "projectTabMaterials",
  "projectTabSkills",
];

/** Returns the localized label/note for a shortcut, falling back to the original text. */
function getShortcutText(
  input: { id: string; label: string; note?: string },
  t: (key: string) => string
) {
  const keyPath = SHORTCUT_KEYS_MAP[input.id];
  const noteKeyPath = SHORTCUT_NOTE_KEYS_MAP[input.id];
  return {
    label: keyPath ? t(`keyboardShortcuts:${keyPath}`) : input.label,
    note: noteKeyPath ? t(`keyboardShortcuts:${noteKeyPath}`) : input.note,
  };
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
    { id: "project.tab.index", label: t('keyboardShortcuts:projectTabIndex'), keys: "Alt+1" },
    { id: "project.tab.canvas", label: t('keyboardShortcuts:projectTabCanvas'), keys: "Alt+2" },
    { id: "project.tab.tasks", label: t('keyboardShortcuts:projectTabTasks'), keys: "Alt+3" },
    { id: "project.tab.materials", label: t('keyboardShortcuts:projectTabMaterials'), keys: "Alt+4" },
    { id: "project.tab.skills", label: t('keyboardShortcuts:projectTabSkills'), keys: "Alt+5" },
  ], [t]);

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title={t('keyboardShortcuts:title')}>
        <div className="divide-y divide-border">
          {GLOBAL_SHORTCUTS.map((shortcut) => {
            const text = getShortcutText(shortcut, (key) => t(key));
            return (
              <div
                key={shortcut.id}
                className="flex flex-wrap items-start gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{text.label}</div>
                  {text.note ? (
                    <div className="text-xs text-muted-foreground mt-1">{text.note}</div>
                  ) : null}
                </div>
                <OpenLoafSettingsField className="shrink-0">
                  <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
                </OpenLoafSettingsField>
              </div>
            );
          })}
        </div>
      </OpenLoafSettingsGroup>
      <OpenLoafSettingsGroup title={t('keyboardShortcuts:projectShortcuts')}>
        <div className="divide-y divide-border">
          {PROJECT_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex flex-wrap items-start gap-3 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{shortcut.label}</div>
              </div>
              <OpenLoafSettingsField className="shrink-0">
                <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
              </OpenLoafSettingsField>
            </div>
          ))}
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
}
