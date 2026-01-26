"use client";

import * as React from "react";
import {
  JSONUIProvider,
  Renderer,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { queryClient, trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import { useChatContext } from "../../ChatProvider";
import type { AnyToolPart } from "./shared/tool-utils";
import {
  asPlainObject,
  getApprovalId,
  isApprovalPending,
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

/** Normalize element type values for known aliases. */
function normalizeElementType(rawType: string): string {
  const trimmed = rawType.trim();
  if (!trimmed) return "unknown";
  const lowered = trimmed.toLowerCase();
  const normalized = lowered.replace(/[_\s]+/g, "-");
  const compact = normalized.replace(/-/g, "");
  // 逻辑：把常见别名统一成 json-render 预期类型。
  if (compact === "textfield") return "text";
  if (compact === "textarea") return "textarea";
  if (normalized === "text-area") return "textarea";
  if (normalized === "text-field") return "text";
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
    const rawType = typeof rawElement.type === "string" ? rawElement.type : "unknown";
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
      props: extractElementProps(rawElement),
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

/** Create the component registry for the json-render tool. */
function createRegistry(options: {
  readOnly: boolean;
  disableActions: boolean;
  hideSubmit: boolean;
}): ComponentRegistry {
  const { readOnly, disableActions, hideSubmit } = options;

  /** Render a form container. */
  function FormContainer({ element, children }: ComponentRenderProps) {
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

  /** Render a text input field. */
  function TextField({ element, loading }: ComponentRenderProps) {
    const props = asPlainObject(element.props) ?? {};
    const label = resolveStringProp(props, ["label", "title"]);
    const placeholder = resolveStringProp(props, ["placeholder", "hint"]);
    const helperText = resolveStringProp(props, ["helperText", "description"]);
    const inputType =
      resolveStringProp(props, ["inputType", "type"]) ??
      (element.type !== "text" ? element.type : "text");
    const required = resolveBooleanProp(props, "required");
    const disabled = readOnly || resolveBooleanProp(props, "disabled") || Boolean(loading);
    const path = resolveFieldPath(element);
    const [value, setValue] = useDataBinding<string>(path);
    const displayValue = value == null ? "" : String(value);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <Label className="text-xs text-foreground/80">
            {label}
            {required ? <span className="text-destructive">*</span> : null}
          </Label>
        ) : null}
        <Input
          type={inputType}
          value={displayValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="bg-background text-foreground placeholder:text-muted-foreground"
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
          <Label className="text-xs text-foreground/80">
            {label}
            {required ? <span className="text-destructive">*</span> : null}
          </Label>
        ) : null}
        <Textarea
          rows={rows}
          value={displayValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="bg-background text-foreground placeholder:text-muted-foreground"
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

    if (actionName === "submit" && hideSubmit) return null;

    return (
      <Button
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
      </Button>
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
    form: FormContainer,
    Form: FormContainer,
    group: FormContainer,
    Group: FormContainer,
    section: FormContainer,
    Section: FormContainer,
    text: TextField,
    "text-field": TextField,
    textField: TextField,
    input: TextField,
    email: TextField,
    number: TextField,
    password: TextField,
    tel: TextField,
    url: TextField,
    Text: TextField,
    Input: TextField,
    Textarea: TextareaField,
    textarea: TextareaField,
    "text-area": TextareaField,
    textArea: TextareaField,
    button: ActionButton,
    Button: ActionButton,
    submit: ActionButton,
    cancel: ActionButton,
    fallback: Fallback,
  } as ComponentRegistry;
}

/** Render json-render tool UI. */
export default function JsonRenderTool({
  part,
  className,
  messageId,
}: {
  part: AnyToolPart;
  className?: string;
  /** Message id for fetching tool output after refresh. */
  messageId?: string;
}) {
  const chat = useChatContext();
  const approvalId = getApprovalId(part);
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const isRejected = part.approval?.approved === false;
  const isApproved = part.approval?.approved === true;
  const hasOutput = part.output != null;
  const isReadonly =
    isRejected || isApproved || hasOutput || part.state === "output-available";
  const isPending = isApprovalPending(part);
  const isStreaming = isToolStreaming(part);
  const tabId = chat.tabId ?? undefined;

  const normalizedInput = normalizeToolInput(part.input);
  const inputObject = asPlainObject(normalizedInput) as JsonRenderInput | null;
  const rawTree = inputObject?.tree;

  const tree = React.useMemo(() => normalizeTree(rawTree), [rawTree]);
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
    ...trpc.chatmessage.updateOneChatMessage.mutationOptions(),
  });

  /** Update tool approval state in local messages. */
  const updateApprovalInMessages = React.useCallback(
    (approved: boolean) => {
      const messages = chat.messages ?? [];
      for (const message of messages) {
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
        chat.updateMessage(message.id, { parts: nextParts });
        return { messageId: message.id, nextParts };
      }
      return null;
    },
    [chat, approvalId],
  );

  /** Update tool approval state in tab snapshot. */
  const updateApprovalSnapshot = React.useCallback(
    (approved: boolean) => {
      const tabId = chat.tabId;
      if (!tabId) return;
      const state = useTabs.getState();
      const toolParts = state.toolPartsByTabId[tabId] ?? {};
      for (const [toolKey, toolPart] of Object.entries(toolParts)) {
        if (toolPart?.approval?.id !== approvalId) continue;
        // 逻辑：提前更新审批状态，避免按钮滞后。
        state.upsertToolPart(tabId, toolKey, {
          ...toolPart,
          approval: { ...toolPart.approval, approved },
        });
        break;
      }
    },
    [chat.tabId, approvalId],
  );

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isActionDisabled =
    isSubmitting || isReadonly || chat.status === "streaming" || chat.status === "submitted";
  /** Whether output needs to be hydrated from DB. */
  const shouldFetchOutput =
    Boolean(messageId && chat.sessionId) && !hasOutput && !isPending;
  /** Track whether output hydration already succeeded. */
  const hasFetchedOutputRef = React.useRef(false);
  /** Track output hydration request state. */
  const isFetchingOutputRef = React.useRef(false);

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
          await chat.addToolApprovalResponse({ id: approvalId, approved: true });
        }
        const payload = { ...dataRef.current };
        await chat.sendMessage(undefined, {
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
      chat,
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
        await chat.addToolApprovalResponse({ id: approvalId, approved: false });
      }
      if (approvalUpdate) {
        try {
          await updateApprovalMutation.mutateAsync({
            where: { id: approvalUpdate.messageId },
            data: { parts: approvalUpdate.nextParts as any },
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
    chat,
    updateApprovalMutation,
  ]);

  const actionHandlers = React.useMemo(
    () => ({
      submit: (params: Record<string, unknown>) => handleSubmit(params),
      cancel: () => handleCancel(),
    }),
    [handleSubmit, handleCancel],
  );

  /** Fetch tool output from DB to rehydrate after refresh. */
  const fetchToolOutput = React.useCallback(async () => {
    if (!shouldFetchOutput || hasFetchedOutputRef.current || isFetchingOutputRef.current) return;
    isFetchingOutputRef.current = true;
    try {
      const data = await queryClient.fetchQuery(
        trpc.chatmessage.findUniqueChatMessage.queryOptions({
          where: { id: String(messageId) },
          select: { id: true, parts: true },
        }),
      );
      const targetParts = Array.isArray((data as any)?.parts) ? (data as any).parts : [];
      if (!targetParts.length) return;
      chat.updateMessage(String(messageId), { parts: targetParts });
      const resolvedToolCallId =
        typeof part.toolCallId === "string" ? String(part.toolCallId) : "";
      if (tabId && resolvedToolCallId) {
        const toolPart = targetParts.find(
          (candidate: any) => String(candidate?.toolCallId ?? "") === resolvedToolCallId,
        );
        if (toolPart) {
          useTabs.getState().upsertToolPart(tabId, resolvedToolCallId, toolPart);
          if (toolPart.output != null) {
            hasFetchedOutputRef.current = true;
          }
        }
      }
    } catch {
      // 逻辑：忽略读取失败，保持 UI 可用。
    } finally {
      isFetchingOutputRef.current = false;
    }
  }, [shouldFetchOutput, messageId, chat, tabId, part.toolCallId]);

  React.useEffect(() => {
    if (!shouldFetchOutput) return;
    void fetchToolOutput();
  }, [shouldFetchOutput, fetchToolOutput]);

  const registry = React.useMemo(
    () =>
      createRegistry({
        readOnly: isReadonly,
        disableActions: isActionDisabled,
        hideSubmit: isReadonly && !part.errorText,
      }),
    [isReadonly, isActionDisabled, part.errorText],
  );

  const containerClassName = "text-foreground";
  return (
    <div className={cn("flex w-full min-w-0 max-w-full justify-center", className)}>
      <div
        className={cn(
          "w-[85%] min-w-0 max-w-[90%] rounded-lg p-3 md:max-w-[720px]",
          containerClassName,
          isStreaming && "tenas-tool-streaming",
        )}
      >
        <div className="flex flex-col gap-3 text-[10px] text-muted-foreground/70">
          <div className="flex flex-col gap-2">
            {tree ? (
              <JSONUIProvider
                key={dataKey}
                registry={registry}
                initialData={dataSeed}
                actionHandlers={actionHandlers}
                onDataChange={handleDataChange}
              >
                <Renderer
                  tree={tree}
                  registry={registry}
                  loading={isSubmitting}
                  fallback={registry.fallback}
                />
              </JSONUIProvider>
            ) : (
              <div className="text-[11px] text-muted-foreground/70">未提供表单结构。</div>
            )}
          </div>
          {typeof part.errorText === "string" && part.errorText.trim() ? (
            <div className="text-[11px] text-destructive">{part.errorText}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
