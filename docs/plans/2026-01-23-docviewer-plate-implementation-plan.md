# DocViewer Plate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the DocViewer with a Plate + docx-io viewer/editor that supports read-only/edit modes and integrates with open-file rules.

**Architecture:** Use `importDocx` to load ArrayBuffer into Plate nodes, render with a minimal plugin set plus Docx/Juice, and persist with `exportToDocx` + `fs.writeBinary`. Add a docx export kit to provide static components for export and update open-file rules to treat doc/docx as internal.

**Tech Stack:** React, Plate, @platejs/docx-io, TanStack Query, tRPC fs, Tailwind UI components.

> **Note:** Project rule overrides TDD/worktree. Execute in the current branch and skip TDD test steps.

### Task 1: Add docx-io dependency and export kit

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/editor/plugins/docx-export-kit.tsx`

**Step 1: Add dependency**

Edit `apps/web/package.json` and add:

```json
"@platejs/docx-io": "^52.0.11"
```

**Step 2: Create docx export kit**

Create `apps/web/src/components/editor/plugins/docx-export-kit.tsx`:

```tsx
'use client';

import { DocxExportPlugin } from '@platejs/docx-io';
import { KEYS } from 'platejs';

import { CalloutElementStatic } from '@/components/ui/callout-node-static';
import {
  CodeBlockElementStatic,
  CodeLineElementStatic,
  CodeSyntaxLeafStatic,
} from '@/components/ui/code-block-node-static';
import {
  ColumnElementStatic,
  ColumnGroupElementStatic,
} from '@/components/ui/column-node-static';
import {
  EquationElementStatic,
  InlineEquationElementStatic,
} from '@/components/ui/equation-node-static';
import { TocElementStatic } from '@/components/ui/toc-node-static';

/**
 * DocxExportKit provides export-time overrides for docx serialization.
 */
export const DocxExportKit = [
  DocxExportPlugin.configure({
    override: {
      components: {
        [KEYS.codeBlock]: CodeBlockElementStatic,
        [KEYS.codeLine]: CodeLineElementStatic,
        [KEYS.codeSyntax]: CodeSyntaxLeafStatic,
        [KEYS.column]: ColumnElementStatic,
        [KEYS.columnGroup]: ColumnGroupElementStatic,
        [KEYS.equation]: EquationElementStatic,
        [KEYS.inlineEquation]: InlineEquationElementStatic,
        [KEYS.callout]: CalloutElementStatic,
        [KEYS.toc]: TocElementStatic,
      },
    },
  }),
];
```

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/components/editor/plugins/docx-export-kit.tsx
git commit -m "feat: add docx export kit"
```

### Task 2: Replace DocViewer with Plate + docx-io

**Files:**
- Replace: `apps/web/src/components/file/DocViewer.tsx`

**Step 1: Remove existing file**

Delete `apps/web/src/components/file/DocViewer.tsx`.

**Step 2: Create new DocViewer**

Create `apps/web/src/components/file/DocViewer.tsx` with Plate-based implementation:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, PencilLine, Save } from 'lucide-react';
import { importDocx, exportToDocx } from '@platejs/docx-io';
import { DocxPlugin } from '@platejs/docx';
import { JuicePlugin } from '@platejs/juice';
import { type TElement, type Value, KEYS } from 'platejs';
import { Plate, useEditorRef, usePlateEditor, useSelectionFragmentProp } from 'platejs/react';

import { StackHeader } from '@/components/layout/StackHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { Toolbar, ToolbarGroup, ToolbarButton } from '@/components/ui/toolbar';
import { UndoToolbarButton, RedoToolbarButton } from '@/components/ui/history-toolbar-button';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
import { BulletedListToolbarButton, NumberedListToolbarButton } from '@/components/ui/list-toolbar-button';
import { Heading1Icon, Heading2Icon, Heading3Icon, PilcrowIcon } from 'lucide-react';

import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { DocxExportKit } from '@/components/editor/plugins/docx-export-kit';
import { EditorStatic } from '@/components/ui/editor-static';

import { useTabs } from '@/hooks/use-tabs';
import { requestStackMinimize } from '@/lib/stack-dock-animation';
import { trpc } from '@/utils/trpc';
import { useWorkspace } from '@/components/workspace/workspaceContext';
import { getBlockType, setBlockType } from '@/components/editor/transforms';

interface DocViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
  /** Whether the viewer is read-only. */
  readOnly?: boolean;
}

type DocViewerStatus = 'idle' | 'loading' | 'ready' | 'error';
type DocViewerMode = 'preview' | 'edit';

/** Convert base64 payload into ArrayBuffer for docx-io. */
function decodeBase64ToArrayBuffer(payload: string): ArrayBuffer {
  // 逻辑：浏览器端 atob 解码后再构建 ArrayBuffer，避免额外依赖。
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert ArrayBuffer into base64 payload for fs.writeBinary. */
function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  // 逻辑：分片拼接避免栈溢出。
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Heading dropdown data.
 */
const headingItems = [
  { label: '正文', value: KEYS.p, Icon: PilcrowIcon },
  { label: '标题 1', value: 'h1', Icon: Heading1Icon },
  { label: '标题 2', value: 'h2', Icon: Heading2Icon },
  { label: '标题 3', value: 'h3', Icon: Heading3Icon },
];

/**
 * Render a small heading selector for the toolbar.
 */
function HeadingToolbarButton() {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });
  const current = headingItems.find((item) => item.value === value) ?? headingItems[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Heading" isDropdown>
          <current.Icon className="size-4" />
          <span className="ml-1 text-xs">{current.label}</span>
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {headingItems.map(({ label, value: itemValue, Icon }) => (
          <DropdownMenuItem
            key={itemValue}
            onSelect={() => {
              setBlockType(editor, itemValue);
            }}
          >
            <Icon className="mr-2 size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Render a DOC/DOCX preview/editor panel powered by Plate. */
export default function DocViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: DocViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';
  /** Current viewer status. */
  const [status, setStatus] = useState<DocViewerStatus>('idle');
  /** Track whether content has been edited. */
  const [isDirty, setIsDirty] = useState(false);
  /** Loaded Plate value. */
  const [value, setValue] = useState<Value>([]);
  /** Current edit/preview mode. */
  const [mode, setMode] = useState<DocViewerMode>(readOnly === false ? 'edit' : 'preview');
  /** Prevent dirty flag during initial load. */
  const initializingRef = useRef(true);
  /** Close current stack panel. */
  const removeStackItem = useTabs((s) => s.removeStackItem);
  /** Whether to render the stack header. */
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  /** Current display title. */
  const displayTitle = useMemo(() => name ?? uri ?? 'DOCX', [name, uri]);

  /** Create editor with minimal plugins plus docx helpers. */
  const editor = usePlateEditor(
    {
      id: `doc-viewer-${uri ?? 'empty'}`,
      enabled: true,
      plugins: [...BasicBlocksKit, ...BasicMarksKit, ...ListKit, DocxPlugin, JuicePlugin],
      value,
    },
    [uri, value]
  );

  /** Flags whether the viewer should load via fs.readBinary. */
  const shouldUseFs =
    typeof uri === 'string' &&
    uri.trim().length > 0 &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith('file://'));

  /** Load binary payload from file system API. */
  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({ workspaceId, projectId, uri: uri ?? '' }),
    enabled: shouldUseFs && Boolean(uri) && Boolean(workspaceId),
  });

  /** Persist binary payload back to file system. */
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());

  useEffect(() => {
    setStatus('idle');
    setIsDirty(false);
    setValue([]);
    setMode(readOnly === false ? 'edit' : 'preview');
    initializingRef.current = true;
  }, [readOnly, uri]);

  useEffect(() => {
    if (!shouldUseFs) return;
    if (fileQuery.isLoading) return;
    if (fileQuery.isError) {
      setStatus('error');
      return;
    }
    const payload = fileQuery.data?.contentBase64;
    if (!payload) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    void (async () => {
      try {
        const buffer = decodeBase64ToArrayBuffer(payload);
        if (!editor) return;
        const result = await importDocx(editor, buffer);
        setValue(result.nodes as Value);
        setStatus('ready');
      } catch {
        setStatus('error');
      } finally {
        initializingRef.current = false;
      }
    })();
  }, [editor, fileQuery.data?.contentBase64, fileQuery.isError, fileQuery.isLoading, shouldUseFs]);

  /** Track dirty state on value changes. */
  const handleValueChange = (nextValue: Value) => {
    setValue(nextValue);
    if (initializingRef.current) return;
    // 逻辑：只在编辑模式下标记脏状态。
    if (readOnly) return;
    setIsDirty(true);
  };

  /** Toggle preview/edit mode. */
  const toggleMode = () => {
    if (readOnly) return;
    setMode((prev) => (prev === 'preview' ? 'edit' : 'preview'));
  };

  /** Save current document to docx file. */
  const handleSave = async () => {
    if (!uri) return;
    if (readOnly) return;
    if (!isDirty) return;
    if (!editor) return;
    try {
      const blob = await exportToDocx(editor.children, {
        editorPlugins: [...BaseEditorKit, ...DocxExportKit],
        editorStaticComponent: EditorStatic,
      });
      const buffer = await blob.arrayBuffer();
      const contentBase64 = encodeArrayBufferToBase64(buffer);
      await writeBinaryMutation.mutateAsync({
        workspaceId,
        projectId,
        uri,
        contentBase64,
      });
      setIsDirty(false);
    } catch {
      // 逻辑：导出失败时给出提示。
      setStatus('error');
    }
  };

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文档</div>;
  }

  const canEdit = readOnly !== true;
  const isEditMode = canEdit && mode === 'edit';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={displayTitle}
          openUri={openUri ?? uri}
          openRootUri={rootUri}
          rightSlot={
            canEdit ? (
              <div className="flex items-center gap-1">
                {isEditMode ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleSave()}
                    disabled={writeBinaryMutation.isPending || !isDirty}
                    aria-label="保存"
                    title="保存"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMode}
                  aria-label={isEditMode ? '预览' : '编辑'}
                  title={isEditMode ? '预览' : '编辑'}
                >
                  {isEditMode ? <Eye className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                </Button>
              </div>
            ) : null
          }
          showMinimize
          onMinimize={() => {
            if (!tabId) return;
            requestStackMinimize(tabId);
          }}
          onClose={() => {
            if (!tabId || !panelKey) return;
            if (isDirty) {
              const ok = window.confirm('当前文档尚未保存，确定要关闭吗？');
              if (!ok) return;
            }
            removeStackItem(tabId, panelKey);
          }}
        />
      ) : null}

      {status === 'loading' || fileQuery.isLoading ? (
        <div className="px-4 pt-3 text-sm text-muted-foreground">加载中…</div>
      ) : null}
      {status === 'error' || fileQuery.isError ? (
        <div className="px-4 pt-3 text-sm text-destructive">文档预览失败</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {editor ? (
          <Plate editor={editor} readOnly={!isEditMode} onValueChange={({ value }) => handleValueChange(value)}>
            {isEditMode ? (
              <div className="border-b border-border/60 bg-muted/30 px-2 py-1">
                <Toolbar>
                  <ToolbarGroup>
                    <UndoToolbarButton />
                    <RedoToolbarButton />
                  </ToolbarGroup>
                  <ToolbarGroup>
                    <HeadingToolbarButton />
                  </ToolbarGroup>
                  <ToolbarGroup>
                    <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold">
                      <span className="text-xs font-semibold">B</span>
                    </MarkToolbarButton>
                    <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic">
                      <span className="text-xs italic">I</span>
                    </MarkToolbarButton>
                    <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline">
                      <span className="text-xs underline">U</span>
                    </MarkToolbarButton>
                  </ToolbarGroup>
                  <ToolbarGroup>
                    <BulletedListToolbarButton />
                    <NumberedListToolbarButton />
                  </ToolbarGroup>
                </Toolbar>
              </div>
            ) : null}
            <EditorContainer className="h-full">
              <Editor variant="fullWidth" className="h-full" readOnly={!isEditMode} />
            </EditorContainer>
          </Plate>
        ) : null}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/file/DocViewer.tsx
git commit -m "feat: rebuild doc viewer with plate docx-io"
```

### Task 3: Update open-file rules

**Files:**
- Modify: `apps/web/src/components/file/lib/open-file.ts`

**Step 1: Update internal doc set**

Change to:

```ts
const INTERNAL_DOC_EXTS = new Set(['doc', 'docx']);
```

**Step 2: Commit**

```bash
git add apps/web/src/components/file/lib/open-file.ts
git commit -m "feat: route doc files to internal viewer"
```

### Task 4: Optional verification (skipped by rule)

**Step 1: Skip tests**

Project rule says skip TDD/tests. If manual verification is desired later:

```bash
pnpm --filter web check-types
```

**Step 2: Commit any fixes**

```bash
git add <files>
git commit -m "fix: doc viewer polish"
```
