"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { exportToDocx, importDocx } from "@platejs/docx-io";
import { DocxPlugin } from "@platejs/docx";
import { JuicePlugin } from "@platejs/juice";
import { Heading1Icon, Heading2Icon, Heading3Icon, Eye, PencilLine, PilcrowIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { KEYS, setValue, type TElement, type Value } from "platejs";
import { Plate, useEditorRef, usePlateEditor, useSelectionFragmentProp } from "platejs/react";

import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit";
import { DocxExportKit } from "@/components/editor/plugins/docx-export-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { BaseEditorKit } from "@/components/editor/editor-base-kit";
import { getBlockType, setBlockType } from "@/components/editor/transforms";
import { StackHeader } from "@/components/layout/StackHeader";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { EditorStatic } from "@/components/ui/editor-static";
import { RedoToolbarButton, UndoToolbarButton } from "@/components/ui/history-toolbar-button";
import { BulletedListToolbarButton, NumberedListToolbarButton } from "@/components/ui/list-toolbar-button";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@/components/ui/toolbar";
import { useTabs } from "@/hooks/use-tabs";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { trpc } from "@/utils/trpc";

interface DocViewerProps {
  /** File uri to preview. */
  uri?: string;
  /** Original uri for system open. */
  openUri?: string;
  /** Display name for the document. */
  name?: string;
  /** File extension. */
  ext?: string;
  /** Project id for file access. */
  projectId?: string;
  /** Root uri for system open. */
  rootUri?: string;
  /** Stack panel key. */
  panelKey?: string;
  /** Stack tab id. */
  tabId?: string;
  /** Whether the viewer is read-only. */
  readOnly?: boolean;
}

/** Viewer loading status. */
type DocViewerStatus = "idle" | "loading" | "ready" | "error";
/** Viewer mode. */
type DocViewerMode = "preview" | "edit";

/** Default viewer mode for doc files. */
const DEFAULT_DOC_MODE: DocViewerMode = "preview";

/** Convert base64 payload into ArrayBuffer for docx-io. */
function decodeBase64ToArrayBuffer(payload: string): ArrayBuffer {
  // 逻辑：使用 atob 解码 base64 后转成 ArrayBuffer。
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert ArrayBuffer into base64 payload for fs.writeBinary. */
function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  // 逻辑：分片拼接避免字符串过长导致栈溢出。
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Heading dropdown options. */
const headingItems = [
  { label: "正文", value: KEYS.p, Icon: PilcrowIcon },
  { label: "标题 1", value: KEYS.h1, Icon: Heading1Icon },
  { label: "标题 2", value: KEYS.h2, Icon: Heading2Icon },
  { label: "标题 3", value: KEYS.h3, Icon: Heading3Icon },
];

/** Render a small heading selector for the toolbar. */
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
      <DropdownMenuContent
        align="start"
        className="min-w-[160px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.tf.focus();
        }}
      >
        {headingItems.map(({ label, value: itemValue, Icon }) => (
          <DropdownMenuItem
            key={itemValue}
            onSelect={() => {
              // 逻辑：选中标题后立即回焦编辑器。
              setBlockType(editor, itemValue);
              editor.tf.focus();
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
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: DocViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  /** Current viewer status. */
  const [status, setStatus] = useState<DocViewerStatus>("idle");
  /** Track whether content has been edited. */
  const [isDirty, setIsDirty] = useState(false);
  /** Current edit/preview mode. */
  const [mode, setMode] = useState<DocViewerMode>(
    readOnly === false ? "edit" : DEFAULT_DOC_MODE
  );
  /** Prevent dirty flag during initial load. */
  const initializingRef = useRef(true);
  /** Close current stack panel. */
  const removeStackItem = useTabs((s) => s.removeStackItem);
  /** Whether to render the stack header. */
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  /** Current display title. */
  const displayTitle = useMemo(() => name ?? uri ?? "DOCX", [name, uri]);

  /** Create editor with minimal plugins plus docx helpers. */
  const editor = usePlateEditor(
    {
      id: `doc-viewer-${uri ?? "empty"}`,
      enabled: true,
      plugins: [...BasicBlocksKit, ...BasicMarksKit, ...ListKit, DocxPlugin, JuicePlugin],
      value: [],
    },
    [uri]
  );

  /** Normalize the uri used for binary reads. */
  const readUri = useMemo(() => {
    const normalized = (uri ?? "").trim();
    if (!normalized) return "";
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized);
    if (hasScheme) return normalized;
    if (!rootUri?.startsWith("file://")) return normalized;
    if (normalized.startsWith("@") || normalized.startsWith("[")) return normalized;
    // 逻辑：拼接到项目根目录生成 file://，避免相对路径解析失败。
    return resolveFileUriFromRoot(rootUri, normalized) || normalized;
  }, [rootUri, uri]);

  /** Flags whether the viewer should load via fs.readBinary. */
  const shouldUseFs =
    Boolean(readUri) &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(readUri) || readUri.startsWith("file://"));

  /** Load binary payload from file system API. */
  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({
      workspaceId,
      projectId,
      uri: readUri,
    }),
    enabled: shouldUseFs && Boolean(readUri) && Boolean(workspaceId),
  });

  /** Persist binary payload back to file system. */
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());

  useEffect(() => {
    setStatus("idle");
    setIsDirty(false);
    setMode(readOnly === false ? "edit" : DEFAULT_DOC_MODE);
    initializingRef.current = true;
  }, [readOnly, uri]);

  useEffect(() => {
    if (!shouldUseFs || !editor) return;
    if (fileQuery.isLoading) return;
    if (fileQuery.isError) {
      console.error("[DocViewer] readBinary failed", fileQuery.error);
      setStatus("error");
      initializingRef.current = false;
      return;
    }
    const payload = fileQuery.data?.contentBase64;
    if (!payload) {
      console.error("[DocViewer] empty docx payload", {
        uri,
        readUri,
        projectId,
      });
      setStatus("error");
      initializingRef.current = false;
      return;
    }
    setStatus("loading");
    initializingRef.current = true;
    let canceled = false;
    const run = async () => {
      try {
        const buffer = decodeBase64ToArrayBuffer(payload);
        const result = await importDocx(editor, buffer);
        if (canceled) return;
        setValue(editor, result.nodes as Value);
        setIsDirty(false);
        setStatus("ready");
      } catch (error) {
        if (canceled) return;
        console.error("[DocViewer] import docx failed", error);
        setStatus("error");
      } finally {
        if (!canceled) {
          initializingRef.current = false;
        }
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, [editor, fileQuery.data?.contentBase64, fileQuery.isError, fileQuery.isLoading, shouldUseFs]);

  const canEdit = readOnly !== true && shouldUseFs;
  const isEditMode = canEdit && mode === "edit";

  /** Track dirty state on value changes. */
  const handleValueChange = (_nextValue: Value) => {
    if (initializingRef.current) return;
    if (!isEditMode) return;
    setIsDirty(true);
  };

  /** Toggle preview/edit mode. */
  const toggleMode = () => {
    if (!canEdit) return;
    setMode((prev) => (prev === "preview" ? "edit" : "preview"));
  };

  /** Save current document to docx file. */
  const handleSave = async () => {
    // 逻辑：仅在可编辑且内容变更时保存。
    if (!uri || !shouldUseFs) {
      toast.error("暂不支持保存此地址");
      return;
    }
    if (!workspaceId) {
      toast.error("未找到工作区");
      return;
    }
    if (!canEdit || !isDirty || !editor) return;
    try {
      const blob = await exportToDocx(editor.children, {
        editorPlugins: [...BaseEditorKit, ...DocxExportKit] as any,
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
      toast.success("已保存");
    } catch {
      toast.error("保存失败");
    }
  };

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文档</div>;
  }

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
                    disabled={
                      writeBinaryMutation.isPending ||
                      !shouldUseFs ||
                      status !== "ready" ||
                      !isDirty
                    }
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
                  aria-label={isEditMode ? "预览" : "编辑"}
                  title={isEditMode ? "预览" : "编辑"}
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
              const ok = window.confirm("当前文档尚未保存，确定要关闭吗？");
              if (!ok) return;
            }
            removeStackItem(tabId, panelKey);
          }}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!shouldUseFs ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            暂不支持此地址
          </div>
        ) : null}
        {status === "loading" || fileQuery.isLoading ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            加载中…
          </div>
        ) : null}
        {status === "error" || fileQuery.isError ? (
          <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            文档预览失败
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <Plate
            editor={editor}
            readOnly={!isEditMode}
            onValueChange={({ value }) => handleValueChange(value)}
          >
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
        </div>
      </div>
    </div>
  );
}
