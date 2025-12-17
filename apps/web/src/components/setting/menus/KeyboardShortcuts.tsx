"use client";

import { useMemo } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { GLOBAL_SHORTCUTS } from "@/lib/globalShortcuts";
import { SettingsGroup } from "./SettingsGroup";

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
      <SettingsGroup title="快捷键">
        <div className="divide-y divide-border">
          {GLOBAL_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-start justify-between gap-6 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{shortcut.label}</div>
                {shortcut.note ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    {shortcut.note}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0">
                <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
              </div>
            </div>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
}

