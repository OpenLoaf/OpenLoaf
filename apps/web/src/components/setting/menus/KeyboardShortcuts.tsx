/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useMemo } from "react";
import { Kbd, KbdGroup } from "@openloaf/ui/kbd";
import { GLOBAL_SHORTCUTS } from "@/lib/globalShortcuts";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";

const SHORTCUT_TRANSLATIONS: Record<string, { label: string; note?: string }> = {
  "sidebar.toggle": { label: "切换侧边栏" },
  "chat.toggle": { label: "切换聊天面板" },
  "search.toggle": { label: "搜索" },
  "open.calendar": { label: "打开日历" },
  "open.inbox": { label: "打开收件箱" },
  "open.ai": { label: "打开工作台" },
  "open.template": { label: "打开模板" },
  "tab.new": { label: "新建标签页" },
  "tab.switch": { label: "切换标签页" },
  "tab.close": { label: "关闭标签页" },
  "settings.open": { label: "打开设置", note: "仅限 Electron + macOS" },
  "refresh.disable": { label: "禁用刷新", note: "仅限生产环境" },
};

const PROJECT_SHORTCUTS = [
  { id: "project.tab.index", label: "项目 · 首页", keys: "Alt+1" },
  { id: "project.tab.canvas", label: "项目 · 画布", keys: "Alt+2" },
  { id: "project.tab.tasks", label: "项目 · 历史", keys: "Alt+3" },
  { id: "project.tab.materials", label: "项目 · 资料", keys: "Alt+4" },
  { id: "project.tab.skills", label: "项目 · 技能", keys: "Alt+5" },
];

/** Returns the localized label/note for a shortcut, falling back to the original text. */
function getShortcutText(input: { id: string; label: string; note?: string }) {
  const translated = SHORTCUT_TRANSLATIONS[input.id];
  return {
    label: translated?.label ?? input.label,
    note: translated?.note ?? input.note,
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
  const isMac = useIsMac();

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title="快捷键">
        <div className="divide-y divide-border">
          {GLOBAL_SHORTCUTS.map((shortcut) => {
            const text = getShortcutText(shortcut);
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
      <OpenLoafSettingsGroup title="项目快捷键">
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
