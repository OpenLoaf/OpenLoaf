# Settings Menu Transition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fade-in + slight upward motion when switching settings menus in the project settings page and main settings page, while respecting the global low-animation setting.

**Architecture:** Keep layout and state intact; wrap each active settings panel with a keyed container that uses existing `tw-animate-css` classes. Rely on `data-ui-animation-level="low"` to zero animation duration instead of adding per-component branches.

**Tech Stack:** React, Next.js, TypeScript, Tailwind CSS (`tw-animate-css`).

**Notes:** Project rules require skipping TDD steps and not creating worktrees; test steps below are marked as skipped where applicable.

### Task 1: Animate project settings panel switch

**Files:**
- Modify: `apps/web/src/components/project/settings/ProjectSettingsPage.tsx`

**Step 1: Write the failing test (skipped per project rule)**

**Step 2: Run test to verify it fails (skipped per project rule)**

**Step 3: Update the active panel wrapper**

```tsx
content={
  <div
    key={activeKey}
    className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out"
  >
    <ActiveComponent projectId={projectId} rootUri={rootUri} />
  </div>
}
```

**Step 4: Manual verification**

Run: `pnpm dev:web`
Expected: Settings menu switches with fade-in + slight upward motion; no layout regressions.

**Step 5: Commit**

```bash
git add apps/web/src/components/project/settings/ProjectSettingsPage.tsx

git commit -m "feat(web): animate project settings menu transitions"
```

### Task 2: Animate settings page panel switch

**Files:**
- Modify: `apps/web/src/components/setting/SettingsPage.tsx`

**Step 1: Write the failing test (skipped per project rule)**

**Step 2: Run test to verify it fails (skipped per project rule)**

**Step 3: Add the animation classes to the keyed wrapper**

```tsx
<div
  key={activeKey}
  className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out"
>
  <ActiveComponent />
</div>
```

**Step 4: Manual verification (includes low animation level)**

Run: `pnpm dev:web`
Expected: Menu switches animate; when UI animation level is set to low, switching is immediate with no motion.

**Step 5: Commit**

```bash
git add apps/web/src/components/setting/SettingsPage.tsx

git commit -m "feat(web): animate settings menu transitions"
```
