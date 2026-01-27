# Chat Runtime Store Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move high-frequency runtime state (including frequently mutating Tab fields) out of use-tabs into dedicated runtime stores to reduce re-renders and eliminate update loops.

**Architecture:** Split tab state into TabMeta (persisted) + TabRuntime (in-memory). `use-tabs` becomes the meta store (tab list, ordering, identifiers, chat binding). A new `use-tab-runtime` store owns base/stack/layout/active stack state. `use-tab-view` composes TabMeta + TabRuntime into a TabView for UI. Separately, add a chat runtime store for tool parts + chat/dictation status. Snapshot sync reads composed TabView and ignores runtime noise.

**Tech Stack:** Next.js 16, React, Zustand, TanStack Query, tRPC, AI SDK, Radix UI.

**Constraints:**
- Project rule: when using superpowers, do NOT create worktrees and skip TDD tests.
- Use manual verification steps instead of failing tests.
- Keep logic comments in Chinese and method comments in English when touching code.

### Task 1: Add shared tab types (TabMeta / TabRuntime / TabView)

**Files:**
- Create: `apps/web/src/hooks/tab-types.ts`

**Step 1: Write the failing test (skipped)**
- Skip per project rule (no TDD in superpowers workflows).

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**

```ts
import type { Tab, DockItem } from "@tenas-ai/api/common";

export type TabMeta = Pick<
  Tab,
  | "id"
  | "workspaceId"
  | "title"
  | "icon"
  | "isPin"
  | "chatSessionId"
  | "chatParams"
  | "chatLoadHistory"
  | "createdAt"
  | "lastActiveAt"
>;

export type TabRuntime = {
  base?: DockItem;
  stack: DockItem[];
  leftWidthPercent: number;
  minLeftWidth?: number;
  rightChatCollapsed?: boolean;
  stackHidden?: boolean;
  activeStackItemId?: string;
};

export type TabView = TabMeta & TabRuntime;
```

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/tab-types.ts
git commit -m "refactor: add tab meta/runtime/view types"
```

### Task 2: Create tab runtime store (layout + stack + active stack state)

**Files:**
- Create: `apps/web/src/hooks/use-tab-runtime.ts`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Move layout/stack actions from `use-tabs` into `use-tab-runtime`:
  - `setTabBase`, `setTabBaseParams`
  - `pushStackItem`, `removeStackItem`, `clearStack`, `setStackItemParams`
  - `setStackHidden`, `setActiveStackItemId`
  - `setTabLeftWidthPercent`, `setTabMinLeftWidth`, `setTabRightChatCollapsed`
  - `setBrowserTabs`, `setTerminalTabs`
- State shape example:

```ts
import { create } from "zustand";
import type { TabRuntime } from "./tab-types";

export type TabRuntimeState = {
  runtimeByTabId: Record<string, TabRuntime>;
  getRuntimeByTabId: (tabId: string) => TabRuntime | undefined;
  setRuntimeByTabId: (tabId: string, next: Partial<TabRuntime>) => void;
  // ...layout/stack actions migrated from use-tabs
};
```

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/use-tab-runtime.ts
git commit -m "refactor: add tab runtime store for layout/stack"
```

### Task 3: Create tab view selector (compose TabMeta + TabRuntime)

**Files:**
- Create: `apps/web/src/hooks/use-tab-view.ts`
- Modify: `apps/web/src/hooks/tab-utils.ts`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Add `useTabView(tabId)` hook:
  - Reads `TabMeta` from `use-tabs`
  - Reads `TabRuntime` from `use-tab-runtime`
  - Returns `TabView` with sensible defaults when runtime is missing
- Add `getTabViewById(tabId)` helper for non-React callers.
- Update `tab-utils.ts` types to accept `TabView` instead of `Tab`.

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/use-tab-view.ts apps/web/src/hooks/tab-utils.ts
git commit -m "refactor: add tab view selector and update tab utils"
```

### Task 4: Refactor use-tabs to meta-only store

**Files:**
- Modify: `apps/web/src/hooks/use-tabs.ts`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Replace `tabs: Tab[]` with `tabs: TabMeta[]`.
- Keep only meta actions: `addTab`, `closeTab`, `setActiveTab`, `setTabTitle`, `setTabIcon`, `setTabPinned`, `setTabChatSession`, `getWorkspaceTabs`, `reorderTabs`.
- Remove runtime fields and actions:
  - `stackHiddenByTabId`, `activeStackItemIdByTabId`
  - `setTabBase`, `pushStackItem`, `setBrowserTabs`, etc.
- Keep `getTabById` as a compatibility helper:
  - Option A: return `TabMeta` only (force callers to use `useTabView`)
  - Option B: return `TabView` by composing `use-tab-runtime`
- Update `persist` migration accordingly.

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/use-tabs.ts
git commit -m "refactor: shrink use-tabs to meta-only store"
```

### Task 5: Migrate tab consumers to use TabView/runtime store

**Files (update all usage sites):**
- Modify: `apps/web/src/components/layout/TabLayout.tsx`
- Modify: `apps/web/src/components/layout/LeftDock.tsx`
- Modify: `apps/web/src/components/layout/header/Header.tsx`
- Modify: `apps/web/src/components/layout/header/StackDockMenuButton.tsx`
- Modify: `apps/web/src/components/layout/header/HeaderTabs.tsx`
- Modify: `apps/web/src/components/board/BoardFileViewer.tsx`
- Modify: `apps/web/src/components/board/BoardPanelHeaderActions.tsx`
- Modify: `apps/web/src/components/desktop/widgets/ThreeDFolderWidget.tsx`
- Modify: `apps/web/src/components/layout/sidebar/ProjectTree.tsx`
- Modify: `apps/web/src/components/layout/sidebar/Sidebar.tsx`
- Modify: `apps/web/src/components/browser/ElectrronBrowserWindow.tsx`
- Modify: `apps/web/src/components/file/TerminalViewer.tsx`
- Modify: `apps/web/src/lib/globalShortcuts.ts`
- Modify: `apps/web/src/lib/stack-dock-animation.ts`
- Modify: `apps/web/src/lib/tab-snapshot.ts`
- Modify: `apps/web/src/components/search/Search.tsx`
- Modify: `apps/web/src/components/board/nodes/lib/link-actions.ts`
- Modify: `apps/web/src/components/chat/Chat.tsx`
- Modify: `apps/web/src/components/chat/ChatHeader.tsx`
- Modify: `apps/web/src/components/chat/ChatCoreProvider.tsx`
- Modify: `apps/web/src/components/chat/message/tools/UnifiedTool.tsx`
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Replace `useTabs((s) => s.getTabById(...))` with `useTabView(...)` for UI that needs stack/layout.
- Use `useTabs` only for meta-only reads (title, icon, isPin, ordering).
- Replace runtime actions with `useTabRuntime` equivalents.
- Ensure `TabLayout` reads layout/stack from TabView, and uses `useTabRuntime` for updates.

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/components/layout/TabLayout.tsx \
  apps/web/src/components/layout/LeftDock.tsx \
  apps/web/src/components/layout/header/Header.tsx \
  apps/web/src/components/layout/header/StackDockMenuButton.tsx \
  apps/web/src/components/layout/header/HeaderTabs.tsx \
  apps/web/src/components/board/BoardFileViewer.tsx \
  apps/web/src/components/board/BoardPanelHeaderActions.tsx \
  apps/web/src/components/desktop/widgets/ThreeDFolderWidget.tsx \
  apps/web/src/components/layout/sidebar/ProjectTree.tsx \
  apps/web/src/components/layout/sidebar/Sidebar.tsx \
  apps/web/src/components/browser/ElectrronBrowserWindow.tsx \
  apps/web/src/components/file/TerminalViewer.tsx \
  apps/web/src/lib/globalShortcuts.ts \
  apps/web/src/lib/stack-dock-animation.ts \
  apps/web/src/lib/tab-snapshot.ts \
  apps/web/src/components/search/Search.tsx \
  apps/web/src/components/board/nodes/lib/link-actions.ts \
  apps/web/src/components/chat/Chat.tsx \
  apps/web/src/components/chat/ChatHeader.tsx \
  apps/web/src/components/chat/ChatCoreProvider.tsx \
  apps/web/src/components/chat/message/tools/UnifiedTool.tsx \
  apps/web/src/components/project/ProjectHistory.tsx
git commit -m "refactor: migrate tab consumers to tab runtime store"
```

### Task 6: Update tab snapshot sync to avoid runtime noise

**Files:**
- Modify: `apps/web/src/hooks/use-tab-snapshot-sync.ts`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Subscribe to changes in `use-tabs` meta + `use-tab-runtime` only.
- Cache last serialized TabView snapshot per (sessionId, tabId) to avoid repeated uploads.
- Keep debounce, but avoid scheduling when snapshot JSON is unchanged.

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/use-tab-snapshot-sync.ts
git commit -m "perf: reduce tab snapshot churn"
```

### Task 7: Create chat runtime store (tool parts + chat/dictation status)

**Files:**
- Create: `apps/web/src/hooks/use-chat-runtime.ts`

**Step 1: Write the failing test (skipped)**
- Skip per project rule (no TDD in superpowers workflows).

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Reuse the state shape from the previous plan:
  - `toolPartsByTabId`
  - `chatStatusByTabId`
  - `dictationStatusByTabId`
  - `upsertToolPart`, `clearToolPartsForTab`, `setTabChatStatus`, `setTabDictationStatus`

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/use-chat-runtime.ts
git commit -m "refactor: add chat runtime store for tool parts and status"
```

### Task 8: Migrate tool parts read/write to chat runtime store

**Files:**
- Modify: `apps/web/src/components/chat/ChatCoreProvider.tsx`
- Modify: `apps/web/src/lib/chat/toolParts.ts`
- Modify: `apps/web/src/lib/chat/dataPart.ts`
- Modify: `apps/web/src/lib/chat/frontend-tool-executor.ts`
- Modify: `apps/web/src/components/tools/ToolResultPanel.tsx`
- Modify: `apps/web/src/components/setting/menus/TestSetting.tsx`
- Modify: `apps/web/src/components/chat/context/ChatToolContext.tsx`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Replace `useTabs` toolParts references with `useChatRuntime`.
- Update `ToolPartSnapshot` import source to `use-chat-runtime`.
- Ensure any "mark streaming" behavior writes to chat runtime store.

Example (pattern):
```ts
import { useChatRuntime } from "@/hooks/use-chat-runtime";

const upsertToolPart = useChatRuntime((s) => s.upsertToolPart);
const clearToolPartsForTab = useChatRuntime((s) => s.clearToolPartsForTab);
const toolParts = useChatRuntime((s) =>
  tabId ? s.toolPartsByTabId[tabId] ?? EMPTY_TOOL_PARTS : EMPTY_TOOL_PARTS
);
```

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/components/chat/ChatCoreProvider.tsx \
  apps/web/src/lib/chat/toolParts.ts \
  apps/web/src/lib/chat/dataPart.ts \
  apps/web/src/lib/chat/frontend-tool-executor.ts \
  apps/web/src/components/tools/ToolResultPanel.tsx \
  apps/web/src/components/setting/menus/TestSetting.tsx \
  apps/web/src/components/chat/context/ChatToolContext.tsx
git commit -m "refactor: move tool parts to chat runtime store"
```

### Task 9: Migrate chat/dictation status to chat runtime store

**Files:**
- Modify: `apps/web/src/components/chat/hooks/use-chat-lifecycle.ts`
- Modify: `apps/web/src/components/chat/input/ChatInput.tsx`
- Modify: `apps/web/src/components/layout/header/HeaderTabs.tsx`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Replace `useTabs` status setters/selectors with `useChatRuntime`.
- Keep the visible UI behaviors the same (status badges, dictation rainbow).

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/components/chat/hooks/use-chat-lifecycle.ts \
  apps/web/src/components/chat/input/ChatInput.tsx \
  apps/web/src/components/layout/header/HeaderTabs.tsx
git commit -m "refactor: move chat/dictation status to chat runtime store"
```

### Task 10 (Optional): Isolate browser/terminal sub-tab state if still noisy

**Files:**
- Create: `apps/web/src/hooks/use-panel-runtime.ts`
- Modify: `apps/web/src/components/browser/ElectrronBrowserWindow.tsx`
- Modify: `apps/web/src/components/file/TerminalViewer.tsx`

**Step 1: Write the failing test (skipped)**
- Skip per project rule.

**Step 2: Run test to verify it fails (skipped)**
- Skip per project rule.

**Step 3: Write minimal implementation**
- Move `browserTabs` / `terminalTabs` arrays out of stack params into a dedicated runtime store.
- Keep stack items as lightweight open/close descriptors only.

**Step 4: Run verification (manual)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 5: Commit**
```bash
git add apps/web/src/hooks/use-panel-runtime.ts \
  apps/web/src/components/browser/ElectrronBrowserWindow.tsx \
  apps/web/src/components/file/TerminalViewer.tsx
git commit -m "refactor: move panel sub-tabs to runtime store"
```

### Task 11: End-to-end manual verification checklist

**Files:** (none)

**Step 1: Run manual QA**
- Start app: `pnpm dev:web`
- Verify: tab switching, pin/reorder, title/icon updates
- Verify: left dock resize + stack open/close still works
- Verify: tool cards stream and show output (open-url, json-render, update-plan)
- Verify: tool approval UI still blocks actions and resumes correctly
- Verify: header tab status indicators update during streaming
- Verify: dictation indicator updates on mic start/stop
- Verify: browser/terminal panels still open and update tabs (if Task 10 done)

**Step 2: Commit (if any changes remain)**
```bash
git status
```

---

**Execution Handoff**

Plan complete and saved to `docs/plans/2026-01-27-chat-runtime-store-refactor.md`. Two execution options:

1. Subagent-Driven (this session) - dispatch a fresh subagent per task, review between tasks
2. Parallel Session (separate) - open a new session and run superpowers:executing-plans

Which approach?
