# Theme Override for System Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `uiTheme` is `system`, a header toggle persists for the rest of the day and survives tab switches/reloads, reverting to system on the next day’s first mount. When `uiTheme` is manual, the header toggle sets the manual theme directly.

**Architecture:** Add a local `localStorage` override keyed by local date. On boot (Providers and panel runtime), apply the override when in system mode; otherwise clear it and apply the manual theme. Keep settings page theme application aligned with the same override logic.

**Tech Stack:** React, TypeScript, next-themes, localStorage.

> **Note:** Project rules require skipping TDD tests and worktrees for superpowers workflows. Use manual verification steps instead.

### Task 1: Add local theme override helper

**Files:**
- Create: `apps/web/src/lib/theme-override.ts`

**Step 1: Create the helper with storage-safe date validation**

```ts
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
    const isTheme = parsed.theme === "light" || parsed.theme === "dark";
    const isDate = typeof parsed.date === "string";
    if (!isTheme || !isDate) {
      // 逻辑：结构异常直接清理，避免重复解析失败。
      clearThemeOverride();
      return null;
    }
    if (parsed.date !== getTodayKey()) {
      // 逻辑：只允许当日覆盖，跨日自动失效。
      clearThemeOverride();
      return null;
    }
    return { theme: parsed.theme, date: parsed.date };
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
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/theme-override.ts
git commit -m "feat(web): add local theme override helper"
```

### Task 2: Apply override in header theme toggle

**Files:**
- Modify: `apps/web/src/components/ui/animated-theme-toggle.tsx`

**Step 1: Import helper and update click logic**

```ts
import {
  clearThemeOverride,
  writeThemeOverride,
} from "@/lib/theme-override";
```

```ts
onClick={() => {
  const nextTheme = effective === "light" ? "dark" : "light";
  toggleTheme(nextTheme);
  // 同步主题选择到设置存储，便于下次启动恢复。
  if (basic.uiTheme === "system") {
    // 保持系统自动切换开关不变，只更新手动偏好。
    writeThemeOverride(nextTheme);
    void setBasic({ uiThemeManual: nextTheme });
    return;
  }
  clearThemeOverride();
  void setBasic({ uiTheme: nextTheme, uiThemeManual: nextTheme });
}}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/ui/animated-theme-toggle.tsx
git commit -m "feat(web): persist header toggle in system mode"
```

### Task 3: Respect override on app bootstrap

**Files:**
- Modify: `apps/web/src/components/Providers.tsx`
- Modify: `apps/web/src/lib/panel-runtime.tsx`

**Step 1: Import helper in both files**

```ts
import { clearThemeOverride, readThemeOverride } from "@/lib/theme-override";
```

**Step 2: Update ThemeSettingsBootstrap in Providers**

```ts
useEffect(() => {
  if (isLoading || appliedThemeRef.current) return;
  const nextTheme = normalizeThemeSelection(basic.uiTheme);
  if (!nextTheme) return;

  if (nextTheme === "system") {
    const override = readThemeOverride();
    const target = override?.theme ?? "system";
    if (theme === target) {
      appliedThemeRef.current = true;
      return;
    }
    appliedThemeRef.current = true;
    setTheme(target);
    return;
  }

  clearThemeOverride();
  if (theme === nextTheme) {
    appliedThemeRef.current = true;
    return;
  }
  appliedThemeRef.current = true;
  setTheme(nextTheme);
}, [isLoading, basic.uiTheme, theme, setTheme]);
```

**Step 3: Update ThemeSettingsBootstrap in panel runtime**

```ts
React.useEffect(() => {
  if (isLoading || appliedThemeRef.current) return;
  const nextTheme = normalizeThemeSelection(basic.uiTheme);
  if (!nextTheme) return;

  if (nextTheme === "system") {
    const override = readThemeOverride();
    const target = override?.theme ?? "system";
    if (theme === target) {
      appliedThemeRef.current = true;
      return;
    }
    appliedThemeRef.current = true;
    setTheme(target);
    return;
  }

  clearThemeOverride();
  if (theme === nextTheme) {
    appliedThemeRef.current = true;
    return;
  }
  appliedThemeRef.current = true;
  setTheme(nextTheme);
}, [isLoading, basic.uiTheme, theme, setTheme]);
```

**Step 4: Commit**

```bash
git add apps/web/src/components/Providers.tsx apps/web/src/lib/panel-runtime.tsx
git commit -m "feat(web): apply system theme override on bootstrap"
```

### Task 4: Keep settings page aligned with override

**Files:**
- Modify: `apps/web/src/components/setting/menus/BasicSettings.tsx`

**Step 1: Import helper**

```ts
import { clearThemeOverride, readThemeOverride } from "@/lib/theme-override";
```

**Step 2: Update the uiTheme effect**

```ts
useEffect(() => {
  if (basicLoading) return;
  if (uiTheme === "system") {
    const override = readThemeOverride();
    setTheme(override?.theme ?? "system");
    return;
  }
  if (uiTheme === "dark" || uiTheme === "light") {
    clearThemeOverride();
    setTheme(uiTheme);
  }
}, [basicLoading, uiTheme, setTheme]);
```

**Step 3: Commit**

```bash
git add apps/web/src/components/setting/menus/BasicSettings.tsx
git commit -m "feat(web): align settings theme with system override"
```

### Task 5: Manual verification

**Step 1:** Ensure “系统自动切换”开启。
**Step 2:** 在 header 切换主题，切 tab 后仍保持新主题。
**Step 3:** 打开设置页，确认不会把主题切回 system。
**Step 4:** 在 localStorage 中把 override 的 `date` 改成非今天，重新加载 → 应回到 system。
