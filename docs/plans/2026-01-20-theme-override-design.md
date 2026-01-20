# Theme Override for System Mode (Header Toggle)

**Goal:** When `uiTheme` is set to `system`, a manual toggle from the header should persist for the rest of the day (including tab switches and reloads). On the next day, the first mount should return to `system`. When `uiTheme` is not `system`, the header toggle should directly set the manual theme.

## Root Cause

The header toggle updates `next-themes` immediately, but `uiTheme` remains `system`. When panels remount, the `ThemeSettingsBootstrap` components re-apply `basic.uiTheme`, which resets the theme back to `system`.

## Approach

Add a lightweight local override that only applies when `uiTheme === "system"`.

- Store `{ theme, date }` in `localStorage` under a stable key.
- When the header toggles while in system mode, write today’s override and update `uiThemeManual` only.
- On bootstrap (Providers and panel runtime), if in system mode, read today’s override:
  - If valid for today, apply that theme.
  - If missing or stale, clear the override and apply `system`.
- If `uiTheme` is manual, clear any override and apply the manual theme.
- Keep settings page behavior aligned by respecting the same override when it’s mounted.

## Files

- `apps/web/src/components/ui/animated-theme-toggle.tsx`
- `apps/web/src/components/Providers.tsx`
- `apps/web/src/lib/panel-runtime.tsx`
- `apps/web/src/components/setting/menus/BasicSettings.tsx`
- `apps/web/src/lib/theme-override.ts` (new helper)

## Edge Cases

- Storage unavailable: fall back to system without throwing.
- Stale override: cleared on first read.
- Long-running session: override remains until next mount (per requirement).

## Verification (Manual)

1. Enable system theme.
2. Toggle theme in header → persists across tab switches.
3. Simulate a new day by changing stored date → next mount returns to system.
