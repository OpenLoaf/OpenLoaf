# Auto Git Init Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically initialize git repositories and merge a standard `.gitignore` template when users create or import non-git projects.

**Architecture:** Add a git-init + gitignore-merge helper in `projectGitService`, then call it from the project creation mutation. Store the gitignore template under `apps/server` and load it at runtime via a resolved path with a safe fallback.

**Tech Stack:** Node.js, TypeScript, isomorphic-git, tRPC router (`packages/api`).

> Note: Project rules require skipping TDD and not creating worktrees for superpowers skills.

### Task 1: Add gitignore template asset

**Files:**
- Create: `apps/server/src/assets/gitignore-template.txt`

**Step 1: Create the template file**

```text
# Tenas default .gitignore

# OS
.DS_Store
Thumbs.db

# Node/Next/Electron
node_modules/
.next/
out/
dist/
build/
.turbo/
.pnpm-debug.log*
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Env
.env
.env.*

# Logs
logs/
*.log

# Cache
.cache/
.eslintcache
.stylelintcache
.parcel-cache/
*.tsbuildinfo

# IDE
.idea/
.vscode/

# Tenas
.tenas-cache/
```

**Step 2: Manual check**

Confirm the file exists and uses ASCII-only content.

### Task 2: Add git init + gitignore merge helper

**Files:**
- Modify: `packages/api/src/services/projectGitService.ts`

**Step 1: Add path + template helpers and repo detection**

```ts
export async function ensureGitRepository(input: {
  rootPath: string;
  defaultBranch: string;
  templatePath: string;
}): Promise<void> {
  // 逻辑：如果已经处于 git 仓库（含上层仓库）则跳过初始化。
}
```

**Step 2: Implement `.gitignore` merge**

```ts
async function mergeGitignoreTemplate(input: {
  rootPath: string;
  templatePath: string;
}): Promise<void> {
  // 逻辑：已有 .gitignore 时追加模板，避免覆盖用户内容。
}
```

**Step 3: Manual check**

Sanity-check new helpers compile and use required English JSDoc + Chinese logic comments.

### Task 3: Wire git init into project creation

**Files:**
- Modify: `packages/api/src/routers/project.ts`

**Step 1: Call helper from create mutation**

```ts
await ensureGitRepository({
  rootPath: projectRootPath,
  defaultBranch: "main",
  templatePath: resolveGitignoreTemplatePath(),
});
```

**Step 2: Manual check**

Verify both create-with-rootUri (import) and new project flows trigger the helper when the directory is not already in a git repo.

### Task 4: Manual verification

**Step 1: Import non-git folder**

Expected: `.git/` created, branch `main`, `.gitignore` has template appended.

**Step 2: Import folder already in git**

Expected: no changes to `.git`, `.gitignore` untouched unless missing template marker.

**Step 3: Create new project**

Expected: git repo initialized with `.gitignore` template.

