"use client";

type ThemeOverride = { theme: "light" | "dark"; date: string };

/** Storage key for the theme override. */
const THEME_OVERRIDE_KEY = "tenas-ui-theme-override";

/** Return today's local date key in YYYY-MM-DD format. */
export function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Read today's theme override from localStorage when available. */
export function readThemeOverride(): ThemeOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThemeOverride>;
    const theme = parsed.theme;
    const date = parsed.date;
    const isTheme = theme === "light" || theme === "dark";
    const isDate = typeof date === "string";
    if (!isTheme || !isDate) {
      clearThemeOverride();
      return null;
    }
    if (date !== getTodayKey()) {
      clearThemeOverride();
      return null;
    }
    return { theme, date };
  } catch {
    clearThemeOverride();
    return null;
  }
}

/** Persist a theme override for today. */
export function writeThemeOverride(theme: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ThemeOverride = { theme, date: getTodayKey() };
    window.localStorage.setItem(THEME_OVERRIDE_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

/** Clear any stored theme override. */
export function clearThemeOverride(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(THEME_OVERRIDE_KEY);
  } catch {
    // no-op
  }
}
