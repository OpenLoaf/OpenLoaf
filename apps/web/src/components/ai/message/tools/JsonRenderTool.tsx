"use client";

import * as React from "react";
import {
  ActionProvider,
  DataProvider,
  Renderer,
  VisibilityProvider,
  useDataBinding,
  type ComponentRegistry,
  type ComponentRenderProps,
} from "@json-render/react";
import { type UIElement, type UITree } from "@json-render/core";
import { cn } from "@/lib/utils";
import { ClipboardListIcon } from "lucide-react";
import { useChatState } from "../../context";
import {
  Tool,
  ToolContent,
  ToolHeader,
} from "@/components/ai-elements/tool";
import type { AnyToolPart } from "./shared/tool-utils";
import {
  asPlainObject,
  getToolName,
  isToolStreaming,
  normalizeToolInput,
} from "./shared/tool-utils";

/** Json render tool input payload. */
type JsonRenderInput = {
  actionName?: string;
  tree?: unknown;
  initialData?: Record<string, unknown>;
};

/** Reserved element keys not treated as props. */
const RESERVED_ELEMENT_KEYS = new Set([
  "type",
  "children",
  "visible",
  "key",
  "parentKey",
  "props",
]);

/** Resolve the first string prop from the provided keys. */
function resolveStringProp(
  props: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Normalize data path to JSON pointer format. */
function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Resolve data binding path for an element. */
function resolveFieldPath(element: UIElement): string {
  const props = asPlainObject(element.props) ?? {};
  const candidate =
    resolveStringProp(props, ["path", "dataPath", "name", "field", "id"]) ??
    element.key;
  if (!candidate.trim()) return `/${element.key}`;
  return normalizePath(candidate);
}

/** Normalize element props for legacy input shapes. */
function extractElementProps(raw: Record<string, unknown>): Record<string, unknown> {
  const props = asPlainObject(raw.props);
  if (props) return props;
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (RESERVED_ELEMENT_KEYS.has(key)) continue;
    flattened[key] = value;
  }
  return flattened;
}

/** Normalize element type values for rendering. */
function normalizeElementType(rawType: string): string {
  const trimmed = rawType.trim();
  if (!trimmed) return "Unknown";
  return trimmed;
}

/** Normalize raw UITree into @json-render/core shape. */
function normalizeTree(rawTree: unknown): UITree | null {
  if (!rawTree || typeof rawTree !== "object" || Array.isArray(rawTree)) return null;
  const treeObject = rawTree as Record<string, unknown>;
  const rawElements = asPlainObject(treeObject.elements) ?? {};
  const elements: Record<string, UIElement> = {};

  for (const [key, value] of Object.entries(rawElements)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const rawElement = value as Record<string, unknown>;
    const rawType = typeof rawElement.type === "string" ? rawElement.type : "Unknown";
    const props = extractElementProps(rawElement);
    const type = normalizeElementType(rawType);
    const children = Array.isArray(rawElement.children)
      ? rawElement.children.filter((child) => typeof child === "string")
      : undefined;
    const visible = rawElement.visible as UIElement["visible"] | undefined;
    const parentKey =
      typeof rawElement.parentKey === "string" || rawElement.parentKey === null
        ? rawElement.parentKey
        : undefined;

    elements[key] = {
      key,
      type,
      props,
      ...(children && children.length > 0 ? { children } : {}),
      ...(parentKey !== undefined ? { parentKey } : {}),
      ...(visible !== undefined ? { visible } : {}),
    };
  }

  const rootCandidate = typeof treeObject.root === "string" ? treeObject.root : "";
  const fallbackRoot = Object.keys(elements)[0] ?? "";
  const root = rootCandidate && elements[rootCandidate] ? rootCandidate : fallbackRoot;
  if (!root) return null;

  return { root, elements };
}

/** Resolve initial data from tool input. */
function resolveInitialData(inputData: unknown): Record<string, unknown> {
  const inputObject = asPlainObject(inputData);
  return inputObject ?? {};
}

/** Build a stable key for provider rehydration. */
function buildDataKey(toolCallId: string, data: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return toolCallId || "empty";
  try {
    return `${toolCallId}:${JSON.stringify(data)}`;
  } catch {
    return toolCallId || "fallback";
  }
}

/** Create the display-only component registry. */
function createRegistry(): ComponentRegistry {
  /** Render a layout container. */
  function LayoutContainer({ element, children }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const title = resolveStringProp(props, ["title", "label"]);
    const description = resolveStringProp(props, ["description", "helperText"]);
    const className = resolveStringProp(props, ["className"]);

    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {title ? (
          <div className="text-xs font-semibold text-foreground/80">{title}</div>
        ) : null}
        {description ? (
          <div className="text-[11px] text-muted-foreground/70">{description}</div>
        ) : null}
        {children}
      </div>
    );
  }

  /** Render a text content block. */
  function TextContent({ element }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const content =
      resolveStringProp(props, ["content", "text", "label", "title"]) ?? "";
    if (!content) return null;
    return <div className="text-sm text-foreground">{content}</div>;
  }

  /** Render a read-only text field (display value from data binding). */
  function TextField({ element }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "title"]);
    const helperText = resolveStringProp(props, ["helperText", "description"]);
    const path = resolveFieldPath(element);
    const [value] = useDataBinding<string>(path);
    const displayValue = value == null ? "" : String(value);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label className="text-xs text-foreground/80">{label}</label>
        ) : null}
        <div className="min-h-9 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          {displayValue || "—"}
        </div>
        {helperText ? (
          <div className="text-[11px] text-muted-foreground/70">{helperText}</div>
        ) : null}
      </div>
    );
  }

  /** Render a read-only textarea field. */
  function TextareaField({ element }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "title"]);
    const helperText = resolveStringProp(props, ["helperText", "description"]);
    const path = resolveFieldPath(element);
    const [value] = useDataBinding<string>(path);
    const displayValue = value == null ? "" : String(value);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label className="text-xs text-foreground/80">{label}</label>
        ) : null}
        <div className="min-h-20 w-full whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          {displayValue || "—"}
        </div>
        {helperText ? (
          <div className="text-[11px] text-muted-foreground/70">{helperText}</div>
        ) : null}
      </div>
    );
  }

  /** Render unknown elements as a simple container. */
  function Fallback({ element, children }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "title"]);

    return (
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-primary/30 p-2">
        {label ? <div className="text-xs text-muted-foreground">{label}</div> : null}
        {children}
      </div>
    );
  }

  return {
    Card: LayoutContainer,
    Section: LayoutContainer,
    Form: LayoutContainer,
    Text: TextContent,
    TextField: TextField,
    TextArea: TextareaField,
    Button: () => null,
    fallback: Fallback,
  } as ComponentRegistry;
}

/** Render json-render tool UI (display-only). */
export default function JsonRenderTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
  messageId?: string;
}) {
  const { status } = useChatState();
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const isStreaming = isToolStreaming(part);

  // 逻辑：会话仍在流式输出时，工具数据可能不完整，抑制错误显示避免闪烁。
  const isChatStreaming = status === "streaming" || status === "submitted";
  const isToolTerminal =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const showError = !isChatStreaming || isToolTerminal;
  const displayErrorText =
    showError && typeof part.errorText === "string" && part.errorText.trim()
      ? part.errorText
      : undefined;

  const normalizedInput = normalizeToolInput(part.input);
  const inputObject = asPlainObject(normalizedInput) as JsonRenderInput | null;
  const rawTree = inputObject?.tree;

  const tree = React.useMemo(() => normalizeTree(rawTree), [rawTree]);

  const toolTitle = getToolName(part);
  React.useMemo(() => {
    if (!tree) return;
    const rootEl = tree.elements[tree.root];
    if (!rootEl) return;
    const props = asPlainObject(rootEl.props);
    if (!props) return;
    const rootTitle = resolveStringProp(props, ['title', 'label']);
    if (rootTitle && rootTitle === toolTitle) {
      delete props.title;
      delete props.label;
    }
  }, [tree, toolTitle]);

  const initialData = React.useMemo(
    () => resolveInitialData(inputObject?.initialData),
    [inputObject?.initialData],
  );

  const dataKey = React.useMemo(
    () => buildDataKey(toolCallId, initialData),
    [toolCallId, initialData],
  );

  const registry = React.useMemo(() => createRegistry(), []);

  const containerClassName = "text-foreground";
  const toolType = part.type === "dynamic-tool" ? "dynamic-tool" : part.type;

  return (
    <Tool
      defaultOpen={isStreaming}
      className={cn("w-full min-w-0 text-xs", className, isStreaming && "tenas-tool-streaming")}
    >
      {toolType === "dynamic-tool" ? (
        <ToolHeader
          title={toolTitle}
          type="dynamic-tool"
          toolName={part.toolName ?? "json-render"}
          state={part.state as any}
          icon={<ClipboardListIcon className="size-3.5 text-muted-foreground" />}
          className="p-2 gap-2 [&_span]:text-xs [&_svg]:size-3.5"
        />
      ) : (
        <ToolHeader
          title={toolTitle}
          type={toolType as any}
          state={part.state as any}
          icon={<ClipboardListIcon className="size-3.5 text-muted-foreground" />}
          className="p-2 gap-2 [&_span]:text-xs [&_svg]:size-3.5"
        />
      )}
      <ToolContent className={cn("space-y-2 p-2 text-xs", containerClassName)}>
        <div className="flex flex-col gap-2 text-[10px] text-muted-foreground/70">
          {tree ? (
            <DataProvider key={dataKey} initialData={initialData}>
              <VisibilityProvider>
                <ActionProvider handlers={{}}>
                  <Renderer
                    tree={tree}
                    registry={registry}
                    fallback={registry.fallback}
                  />
                </ActionProvider>
              </VisibilityProvider>
            </DataProvider>
          ) : (
            <div className="text-[11px] text-muted-foreground/70">未提供展示结构。</div>
          )}
          {displayErrorText ? (
            <div className="text-[11px] text-destructive">{displayErrorText}</div>
          ) : null}
        </div>
      </ToolContent>
    </Tool>
  );
}
