# Board Toolbar Generate Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a folder-style button at the end of the board toolbar that opens a hover/click panel with three generate tools (image prompt, image generate, video generate) which enter pending insert mode when clicked.

**Architecture:** Extend `BoardToolbar` state to manage a new hover/pinned panel, reuse the existing `HoverPanel`/`PanelItem` UI, and trigger the existing `handleInsertRequest` flow for node insertion. Keep layout stable by rendering a floating panel rather than expanding the toolbar width.

**Tech Stack:** Next.js (React), Tailwind CSS, lucide-react icons.

### Task 1: Add generate tool data + state handling in the toolbar

**Files:**
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`

**Step 1: Write the failing test (skipped)**
Reason: Project rule requires skipping TDD tests for superpowers skills; change is UI-only.

**Step 2: Run test to verify it fails (skipped)**
Run: `pnpm -w test`
Expected: Skipped.

**Step 3: Write minimal implementation**
- Import icons and node types.
- Add generate tool definitions and open/close state.
- Extend the outside-click handler to close the generate panel.

```tsx
import { FolderOpen, Image, Play, Sparkles } from "lucide-react";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/ImageGenerateNode";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/ImagePromptGenerateNode";
import { VIDEO_GENERATE_NODE_TYPE } from "../nodes/VideoGenerateNode";

const GENERATE_INSERT_ITEMS: InsertItem[] = [
  {
    id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    title: "图片提示词",
    description: "分析图片并生成描述",
    icon: Sparkles,
    nodeType: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    props: {},
    size: [320, 220],
  },
  {
    id: IMAGE_GENERATE_NODE_TYPE,
    title: "图片生成",
    description: "输入图片与文字生成新图",
    icon: Image,
    nodeType: IMAGE_GENERATE_NODE_TYPE,
    props: {},
    size: [320, 260],
  },
  {
    id: VIDEO_GENERATE_NODE_TYPE,
    title: "生成视频",
    description: "基于图片与提示词生成视频",
    icon: Play,
    nodeType: VIDEO_GENERATE_NODE_TYPE,
    props: {},
    size: [360, 280],
  },
];

const [insertPanelPinned, setInsertPanelPinned] = useState(false);
const insertPanelOpen = !isLocked && (hoverGroup === "insert" || insertPanelPinned);
```

**Step 4: Run tests (skipped)**
Run: `pnpm -w test`
Expected: Skipped.

**Step 5: Commit (skipped)**
Run: `git add apps/web/src/components/board/toolbar/BoardToolbar.tsx`
Run: `git commit -m "feat: add generate tools panel to board toolbar"`
Expected: Skipped (user did not request a commit).

### Task 2: Render the generate tools panel at the end of the toolbar

**Files:**
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`

**Step 1: Write the failing test (skipped)**
Reason: Project rule requires skipping TDD tests for superpowers skills; change is UI-only.

**Step 2: Run test to verify it fails (skipped)**
Run: `pnpm -w test`
Expected: Skipped.

**Step 3: Write minimal implementation**
- Append a new toolbar block after the existing insert items.
- Open panel on hover or click; keep open when pinned; close on outside click or after selection.

```tsx
<div
  className="relative"
  onMouseEnter={() => {
    if (isLocked) return;
    setHoverGroup("insert");
  }}
  onMouseLeave={() => {
    if (insertPanelPinned) return;
    setHoverGroup(null);
  }}
>
  <IconBtn
    title="生成工具"
    onPointerDown={() => {
      if (isLocked) return;
      setHoverGroup("insert");
      setInsertPanelPinned(true);
    }}
    className="group h-8 w-8"
    disabled={isLocked}
  >
    <FolderOpen size={toolbarIconSize} className={toolbarIconClassName} />
  </IconBtn>
  <HoverPanel open={insertPanelOpen} className="w-max">
    <div className="flex items-center gap-2">
      {GENERATE_INSERT_ITEMS.map(item => {
        const Icon = item.icon;
        const request: CanvasInsertRequest = {
          id: item.id,
          type: item.nodeType ?? "text",
          props: item.props ?? {},
          size: item.size,
        };
        return (
          <PanelItem
            key={item.id}
            title={item.title}
            active={pendingInsert?.id === item.id}
            onPointerDown={() => {
              if (isLocked) return;
              handleInsertRequest(request);
              setInsertPanelPinned(false);
            }}
          >
            <Icon size={16} />
          </PanelItem>
        );
      })}
    </div>
  </HoverPanel>
</div>
```

**Step 4: Run tests (skipped)**
Run: `pnpm -w test`
Expected: Skipped.

**Step 5: Commit (skipped)**
Run: `git add apps/web/src/components/board/toolbar/BoardToolbar.tsx`
Run: `git commit -m "feat: add generate tools panel to board toolbar"`
Expected: Skipped (user did not request a commit).

### Manual Verification
- Hover the new folder icon at the end of the toolbar; panel opens.
- Click the folder icon; panel stays open until clicking outside.
- Click each tool; panel closes and enters pending insert mode.
- When canvas is locked, the folder icon is disabled and panel does not open.
