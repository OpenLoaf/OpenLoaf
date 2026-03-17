"use client";

export type SettingsMenuScope = "global" | "project";

const SETTINGS_MENU_STORAGE_KEY: Record<SettingsMenuScope, string> = {
  global: "openloaf:settings-menu:global",
  project: "openloaf:settings-menu:project",
};

/** Read the last active settings menu for one scope from browser storage. */
export function readPersistedSettingsMenu(scope: SettingsMenuScope): string | null {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(SETTINGS_MENU_STORAGE_KEY[scope]);
    return rawValue?.trim() || null;
  } catch {
    return null;
  }
}

/** Persist the last active settings menu for one scope into browser storage. */
export function writePersistedSettingsMenu(scope: SettingsMenuScope, menuKey: string) {
  if (typeof window === "undefined") return;
  const trimmedMenuKey = menuKey.trim();
  if (!trimmedMenuKey) return;
  try {
    window.localStorage.setItem(SETTINGS_MENU_STORAGE_KEY[scope], trimmedMenuKey);
  } catch {
    // 中文注释：浏览器禁用存储时静默跳过，不阻断设置页交互。
  }
}
