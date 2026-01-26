# UI Package Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move `apps/web/src/components/ui` and `apps/web/src/components/animate-ui` into a new workspace package and update all imports/configs to consume `@tenas-ai/ui`.

**Architecture:** Create `packages/ui` as a workspace package that exposes UI components via subpath exports. Move the current UI/animate UI sources into `packages/ui/src`, update imports to `@tenas-ai/ui/...`, and configure the web app to transpile the package and scan it for Tailwind classes.

**Tech Stack:** TypeScript, React, Next.js, pnpm workspaces, Tailwind CSS

**Note:** Per project rules, skip TDD and worktrees; execute directly in the current branch.

---

### Task 1: Scaffold `packages/ui`

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tsconfig.check.json`
- Create: `packages/ui/.gitignore`
- Create: `packages/ui/src/index.ts`

**Step 1: Create the package structure**
- Create `packages/ui/src` and the base package files.

**Step 2: Define package metadata and exports**
- Add `@tenas-ai/ui` name, workspace settings, and `exports` mapping to `packages/ui/package.json`.

**Step 3: Add TypeScript configs**
- Extend `@tenas-ai/config/tsconfig.base.json` and enable JSX + DOM libs in `packages/ui/tsconfig.json`.

---

### Task 2: Move UI sources into the package

**Files:**
- Move: `apps/web/src/components/ui/**` → `packages/ui/src/**`
- Move: `apps/web/src/components/animate-ui/**` → `packages/ui/src/animate-ui/**`

**Step 1: Move UI components**
- Move all files from `apps/web/src/components/ui` into `packages/ui/src`.

**Step 2: Move animate-ui components**
- Move `apps/web/src/components/animate-ui` into `packages/ui/src/animate-ui`.

**Step 3: Remove empty source folders**
- Delete the now-empty `apps/web/src/components/ui` and `apps/web/src/components/animate-ui` directories.

---

### Task 3: Update imports to the new package path

**Files:**
- Modify: `apps/web/src/**/*.ts`
- Modify: `apps/web/src/**/*.tsx`
- Modify: `packages/ui/src/**/*.ts`
- Modify: `packages/ui/src/**/*.tsx`

**Step 1: Replace UI imports**
- Replace `@/components/ui/` with `@tenas-ai/ui/` across the repo.

**Step 2: Replace animate-ui imports**
- Replace `@/components/animate-ui/` with `@tenas-ai/ui/animate-ui/`.

**Step 3: Sanity check internal references**
- Ensure moved files don’t reference the old `@/components/ui` path.

---

### Task 4: Update web app configuration and dependencies

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.js`
- Modify: `apps/web/tailwind.config.js`
- Modify: `apps/web/components.json`

**Step 1: Add workspace dependency**
- Add `@tenas-ai/ui` to `apps/web/package.json` with `workspace:*`.

**Step 2: Transpile the UI package**
- Add `transpilePackages: ["@tenas-ai/ui"]` in `apps/web/next.config.js`.

**Step 3: Tailwind content paths**
- Include `../../packages/ui/src/**/*.{ts,tsx}` in `apps/web/tailwind.config.js`.

**Step 4: Update shadcn alias (optional but recommended)**
- Point `aliases.ui` to `@tenas-ai/ui` in `apps/web/components.json`.

---

### Task 5: Verification (non‑TDD)

**Step 1: Type check the web app**
- Run: `pnpm --filter web check-types`
- Expected: No TypeScript errors related to UI imports.

**Optional Step 2: Commit**
- If requested, commit with a concise message after verifying.
