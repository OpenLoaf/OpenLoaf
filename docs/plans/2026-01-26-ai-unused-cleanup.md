# AI Unused Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** Remove unused files/exports/functions under `apps/server/src/ai` based on code references only.

**Architecture:** Inventory exports and imports in `apps/server/src/ai`, verify usage across `apps/server/src`, then delete truly unused items and update the `ai/index.ts` barrel. Skip docs and non-code references.

**Tech Stack:** TypeScript, pnpm, ripgrep (rg)

---

### Task 1: Build the unused-candidate list

**Files:**
- Inspect: `apps/server/src/ai/**`
- Inspect: `apps/server/src/**`

**Step 1: List AI files**

Run: `rg --files apps/server/src/ai`
Expected: A full list of files under `apps/server/src/ai` to audit.

**Step 2: Extract exported symbols**

Run: `rg -n "export (class|function|const|type|interface)" apps/server/src/ai`
Expected: A list of exported symbols and their file locations.

**Step 3: Check symbol usage in code**

For each exported symbol, run: `rg -n "<SymbolName>" apps/server/src`
Expected: If only the defining file and `apps/server/src/ai/index.ts` appear, mark as unused.

---

### Task 2: Remove unused exports and files

**Files:**
- Modify: `apps/server/src/ai/index.ts`
- Modify/Delete: `apps/server/src/ai/**` (unused items only)

**Step 1: Remove unused exports from their files**

Edit each candidate file to remove the unused export or delete the file if it only contains that export.

**Step 2: Remove barrel re-exports**

Edit `apps/server/src/ai/index.ts` to remove re-exports of deleted items.

**Step 3: Remove empty files**

If a file becomes empty after removing unused exports, delete it.

---

### Task 3: Remove unused internal helpers (non-exported)

**Files:**
- Modify: `apps/server/src/ai/**`

**Step 1: Scan for unused local helpers**

Within touched files, remove helper functions or constants that are not referenced in the same file.

---

### Task 4: Verify type safety (no TDD per project rule)

**Files:**
- Test: none added (per project rule to skip TDD)

**Step 1: Run server typecheck**

Run: `pnpm --filter server check-types`
Expected: PASS with no TypeScript errors.

---

### Notes

- Worktree is skipped per project rule.
- Commit steps are omitted unless the user explicitly asks.
