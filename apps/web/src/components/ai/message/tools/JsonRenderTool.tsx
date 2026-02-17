"use client";

import * as React from "react";
import {
  ActionProvider,
  DataProvider,
  Renderer,
  VisibilityProvider,
  useActions,
  useDataBinding,
  type ComponentRegistry,
  type ComponentRenderProps,
} from "@json-render/react";
import {
  type Action,
  setByPath,
  type UIElement,
  type UITree,
} from "@json-render/core";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ClipboardListIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useChatActions, useChatSession, useChatState, useChatTools } from "../../context";
import {
  Tool,
  ToolContent,
  ToolHeader,
} from "@/components/ai-elements/tool";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import type { AnyToolPart } from "./shared/tool-utils";
import {
  asPlainObject,
  getApprovalId,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
} from "./shared/tool-utils";

/** Json render tool input payload. */
type JsonRenderInput = {
  actionName?: string;
  mode?: "approve" | "display";
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

/** Resolve a boolean prop with string fallback. */
function resolveBooleanProp(props: Record<string, unknown>, key: string): boolean {
  const value = props[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim() === "true";
  return false;
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
  // 逻辑：兼容旧格式，把非保留字段当作 props。
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

/** Resolve a json-render action from props. */
function resolveAction(
  value: unknown,
  params?: Record<string, unknown>,
): Action | null {
  if (!value) return null;
  if (typeof value === "string") {
    const name = value.trim();
    if (!name) return null;
    return params && Object.keys(params).length > 0 ? { name, params } : { name };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const action = value as Action;
    return typeof action.name === "string" && action.name.trim() ? action : null;
  }
  return null;
}

/** Resolve action name from element props. */
function resolveActionNameFromProps(props: Record<string, unknown>): string {
  const params = asPlainObject(props.params) ?? undefined;
  const rawAction = props.action ?? props.actionName ?? props.onAction;
  const action = resolveAction(rawAction, params ?? undefined);
  return typeof action?.name === "string" ? action.name : "";
}

/** Ensure only one submit action is rendered. */
function limitSubmitActions(tree: UITree): UITree {
  const visited = new Set<string>();
  let hasSubmit = false;

  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const element = tree.elements[key];
    if (!element) return;
    if (element.type === "Button") {
      const props = asPlainObject(element.props) ?? {};
      const actionName = resolveActionNameFromProps(props);
      if (actionName === "submit") {
        if (hasSubmit) {
          // 逻辑：只保留首个 submit，后续 submit 直接隐藏。
          element.visible = false;
        } else {
          hasSubmit = true;
        }
      }
    }
    const children = Array.isArray(element.children) ? element.children : [];
    for (const childKey of children) {
      visit(childKey);
    }
  };

  visit(tree.root);
  return tree;
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

  return limitSubmitActions({ root, elements });
}

/** Resolve initial data from tool input or output. */
function resolveInitialData(
  inputData: unknown,
  outputData: unknown,
): Record<string, unknown> {
  const outputObject = asPlainObject(normalizeToolInput(outputData));
  if (outputObject) return outputObject;
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

/** Create the component registry for the json-render tool. */
function createRegistry(options: {
  readOnly: boolean;
  disableActions: boolean;
  hideSubmit: boolean;
  hideActions: boolean;
}): ComponentRegistry {
  const { readOnly, disableActions, hideSubmit, hideActions } = options;

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

  /** Render a text input field. */
  function TextField({ element, loading }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "title"]);
    const placeholder = resolveStringProp(props, ["placeholder", "hint"]);
    const helperText = resolveStringProp(props, ["helperText", "description"]);
    const inputType =
      resolveStringProp(props, ["inputType", "type"]) ??
      "text";
    const required = resolveBooleanProp(props, "required");
    const disabled = readOnly || resolveBooleanProp(props, "disabled") || Boolean(loading);
    const path = resolveFieldPath(element);
    const [value, setValue] = useDataBinding<string>(path);
    const displayValue = value == null ? "" : String(value);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label className="text-xs text-foreground/80">
            {label}
            {required ? <span className="text-destructive">*</span> : null}
          </label>
        ) : null}
        <input
          type={inputType}
          value={displayValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground",
            "outline-none ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onChange={(event) => setValue(event.target.value)}
        />
        {helperText ? (
          <div className="text-[11px] text-muted-foreground/70">{helperText}</div>
        ) : null}
      </div>
    );
  }

  /** Render a textarea field. */
  function TextareaField({ element, loading }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "title"]);
    const placeholder = resolveStringProp(props, ["placeholder", "hint"]);
    const helperText = resolveStringProp(props, ["helperText", "description"]);
    const required = resolveBooleanProp(props, "required");
    const disabled = readOnly || resolveBooleanProp(props, "disabled") || Boolean(loading);
    const rows = typeof props.rows === "number" ? props.rows : undefined;
    const path = resolveFieldPath(element);
    const [value, setValue] = useDataBinding<string>(path);
    const displayValue = value == null ? "" : String(value);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label className="text-xs text-foreground/80">
            {label}
            {required ? <span className="text-destructive">*</span> : null}
          </label>
        ) : null}
        <textarea
          rows={rows}
          value={displayValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={cn(
            "min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
            "outline-none ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onChange={(event) => setValue(event.target.value)}
        />
        {helperText ? (
          <div className="text-[11px] text-muted-foreground/70">{helperText}</div>
        ) : null}
      </div>
    );
  }

  /** Render an action button. */
  function ActionButton({ element, onAction, loading }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "text", "title"]) ?? "提交";
    const params = asPlainObject(props.params) ?? undefined;
    const rawAction = props.action ?? props.actionName ?? props.onAction;
    const action = resolveAction(rawAction, params ?? undefined);
    const variant =
      resolveStringProp(props, ["variant"]) ?? (action?.name === "cancel" ? "outline" : "default");
    const size = resolveStringProp(props, ["size"]) ?? "sm";
    const disabled =
      readOnly ||
      disableActions ||
      resolveBooleanProp(props, "disabled") ||
      Boolean(loading);
    const actionName = typeof action?.name === "string" ? action.name : "";

    if (hideActions) return null;
    if (actionName === "submit" && hideSubmit) return null;

    return (
      <PromptInputButton
        type="button"
        size={size as any}
        variant={variant as any}
        disabled={disabled}
        onClick={() => {
          if (!action || !onAction) return;
          onAction(action);
        }}
      >
        {label}
      </PromptInputButton>
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
    Button: ActionButton,
    fallback: Fallback,
  } as ComponentRegistry;
}

function ActionHandlersBinder({
  handlers,
}: {
  handlers: Record<string, (params?: Record<string, unknown>) => void | Promise<void>>;
}) {
  const { registerHandler } = useActions();
  React.useEffect(() => {
    for (const [name, handler] of Object.entries(handlers)) {
      registerHandler(name, handler);
    }
  }, [handlers, registerHandler]);
  return null;
}

/** Render json-render tool UI. */
export default function JsonRenderTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
  messageId?: string;
}) {
  const { messages, status } = useChatState();
  const { updateMessage, addToolApprovalResponse, sendMessage } = useChatActions();
  const { toolParts, upsertToolPart } = useChatTools();
  const { sessionId } = useChatSession();
  const approvalId = getApprovalId(part);
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const isRejected = part.approval?.approved === false;
  const isApproved = part.approval?.approved === true;
  const hasOutput = part.output != null;
  const isStreaming = isToolStreaming(part);
  const isApprovalPendingForPart = isApprovalPending(part);

  // 逻辑：会话仍在流式输出时，工具数据可能不完整，抑制错误显示避免闪烁。
  const isChatStreaming = status === "streaming" || status === "submitted";
  const isToolTerminal =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied";
  const showError =
    !isChatStreaming || isToolTerminal;
  const displayErrorText =
    showError && typeof part.errorText === "string" && part.errorText.trim()
      ? part.errorText
      : undefined;

  const normalizedInput = normalizeToolInput(part.input);
  const inputObject = asPlainObject(normalizedInput) as JsonRenderInput | null;
  const rawTree = inputObject?.tree;
  const mode = inputObject?.mode === "display" ? "display" : "approve";
  const isDisplayMode = mode === "display";
  const isReadonly =
    isDisplayMode || isRejected || isApproved || hasOutput || part.state === "output-available";

  const tree = React.useMemo(() => normalizeTree(rawTree), [rawTree]);

  // 逻辑：如果根元素的 title 与 ToolHeader 标题相同，移除根元素 title 避免重复显示。
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
    () => resolveInitialData(inputObject?.initialData, part.output),
    [inputObject?.initialData, part.output],
  );

  /** Snapshot data used to rehydrate provider state. */
  const [dataSeed, setDataSeed] = React.useState<Record<string, unknown>>(initialData);
  /** Data ref used for submission. */
  const dataRef = React.useRef<Record<string, unknown>>(initialData);
  /** Build a key for remounting provider with fresh data. */
  const dataKey = React.useMemo(
    () => buildDataKey(toolCallId, dataSeed),
    [toolCallId, dataSeed],
  );
  React.useEffect(() => {
    setDataSeed(initialData);
    dataRef.current = { ...initialData };
  }, [initialData]);

  const updateApprovalMutation = useMutation({
    ...trpc.chat.updateMessageParts.mutationOptions(),
  });

  /** Update tool approval state in local messages. */
  const updateApprovalInMessages = React.useCallback(
    (approved: boolean) => {
      const nextMessages = messages ?? [];
      for (const message of nextMessages) {
        const parts = Array.isArray((message as any)?.parts) ? (message as any).parts : [];
        const hasTarget = parts.some((candidate: any) => candidate?.approval?.id === approvalId);
        if (!hasTarget) continue;
        const nextParts = parts.map((candidate: any) => {
          if (candidate?.approval?.id !== approvalId) return candidate;
          return {
            ...candidate,
            approval: { ...candidate.approval, approved },
          };
        });
        updateMessage(message.id, { parts: nextParts });
        return { messageId: message.id, nextParts };
      }
      return null;
    },
    [messages, updateMessage, approvalId],
  );

  /** Update tool approval state in tab snapshot. */
  const updateApprovalSnapshot = React.useCallback(
    (approved: boolean) => {
      for (const [toolKey, toolPart] of Object.entries(toolParts)) {
        if (toolPart?.approval?.id !== approvalId) continue;
        // 逻辑：提前更新审批状态，避免按钮滞后。
        upsertToolPart(toolKey, {
          ...toolPart,
          approval: { ...toolPart.approval, approved },
        });
        break;
      }
    },
    [toolParts, upsertToolPart, approvalId],
  );

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isActionDisabled =
    isDisplayMode ||
    isSubmitting ||
    isReadonly ||
    status === "submitted" ||
    (status === "streaming" && !isApprovalPendingForPart);
  /** Persist data changes to the local ref. */
  const handleDataChange = React.useCallback((path: string, value: unknown) => {
    if (!path) return;
    // 逻辑：保持 dataRef 与 Provider 内状态一致。
    const next = { ...dataRef.current };
    setByPath(next, path, value);
    dataRef.current = next;
  }, []);

  /** Submit approval payload and continue execution. */
  const handleSubmit = React.useCallback(
    async (_params?: Record<string, unknown>) => {
      if (!toolCallId || isActionDisabled) return;
      setIsSubmitting(true);
      updateApprovalSnapshot(true);
      updateApprovalInMessages(true);
      try {
        if (approvalId) {
          await addToolApprovalResponse({ id: approvalId, approved: true });
        }
        const payload = { ...dataRef.current };
        await sendMessage(undefined as any, {
          body: { toolApprovalPayloads: { [toolCallId]: payload } },
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      toolCallId,
      isActionDisabled,
      updateApprovalSnapshot,
      updateApprovalInMessages,
      approvalId,
      addToolApprovalResponse,
      sendMessage,
    ],
  );

  /** Reject the approval without continuing execution. */
  const handleCancel = React.useCallback(async () => {
    if (isSubmitting || isReadonly) return;
    setIsSubmitting(true);
    updateApprovalSnapshot(false);
    const approvalUpdate = updateApprovalInMessages(false);
    try {
      if (approvalId) {
        await addToolApprovalResponse({ id: approvalId, approved: false });
      }
      if (approvalUpdate) {
        try {
          await updateApprovalMutation.mutateAsync({
            sessionId,
            messageId: approvalUpdate.messageId,
            parts: approvalUpdate.nextParts as any,
          });
        } catch {
          // 逻辑：落库失败时保留本地状态，避免阻断拒绝流程。
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    isReadonly,
    updateApprovalSnapshot,
    updateApprovalInMessages,
    approvalId,
    addToolApprovalResponse,
    updateApprovalMutation,
  ]);

  const actionHandlers = React.useMemo(
    () => ({
      submit: (params?: Record<string, unknown>) => handleSubmit(params ?? {}),
      cancel: () => handleCancel(),
    }),
    [handleSubmit, handleCancel],
  );

  const registry = React.useMemo(
    () =>
      createRegistry({
        readOnly: isReadonly,
        disableActions: isActionDisabled,
        hideSubmit: isDisplayMode || (isReadonly && !displayErrorText),
        hideActions: isDisplayMode,
      }),
    [isReadonly, isActionDisabled, isDisplayMode, part.errorText],
  );

  const containerClassName = "text-foreground";
  const toolType = part.type === "dynamic-tool" ? "dynamic-tool" : part.type;

  return (
    <Tool
      defaultOpen={isStreaming || isApprovalPendingForPart}
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
            <DataProvider
              key={dataKey}
              initialData={dataSeed}
              onDataChange={handleDataChange}
            >
              <VisibilityProvider>
                <ActionProvider handlers={actionHandlers}>
                  <ActionHandlersBinder handlers={actionHandlers} />
                  <Renderer
                    tree={tree}
                    registry={registry}
                    loading={isSubmitting}
                    fallback={registry.fallback}
                  />
                </ActionProvider>
              </VisibilityProvider>
            </DataProvider>
          ) : (
            <div className="text-[11px] text-muted-foreground/70">未提供表单结构。</div>
          )}
          {displayErrorText ? (
            <div className="text-[11px] text-destructive">{displayErrorText}</div>
          ) : null}
        </div>
      </ToolContent>
    </Tool>
  );
}
