# Chat Context Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 拆分聊天上下文为多 Context + 抽离核心 hooks，移除旧 `useChatContext`，让前端聊天架构高内聚低耦合。

**Architecture:** 新增 `ChatCoreProvider` 作为核心接入层，内部通过 `ChatState/Session/Actions/Options/Tools` 多个 Context 分发状态与行为；将生命周期、工具流、分支导航、模型能力、消息组装等逻辑抽离为独立 hooks；UI 组件只订阅必要 Context，避免跨层依赖与冗余渲染。

**Tech Stack:** React + TypeScript, TanStack Query, Zustand(`useTabs`), AI SDK, Next.js App Router.

**Note:** 项目规则要求在使用 superpowers skill 时跳过 TDD 测试、不要创建 worktree。本计划省略测试与 commit 步骤，直接在当前分支修改；如需补测或提交请再确认。

---

### Task 1: 新增多 Context 文件与统一导出

**Files:**
- Create: `apps/web/src/components/chat/context/ChatStateContext.tsx`
- Create: `apps/web/src/components/chat/context/ChatSessionContext.tsx`
- Create: `apps/web/src/components/chat/context/ChatActionsContext.tsx`
- Create: `apps/web/src/components/chat/context/ChatOptionsContext.tsx`
- Create: `apps/web/src/components/chat/context/ChatToolContext.tsx`
- Create: `apps/web/src/components/chat/context/index.ts`

**Step 1: 写入 Context 模板（通用骨架）**
```tsx
"use client";

import React, { createContext, useContext, type ReactNode } from "react";

export type ChatXxxContextValue = {
  // English: describe the purpose of this context value.
};

const ChatXxxContext = createContext<ChatXxxContextValue | null>(null);

export function ChatXxxProvider({
  value,
  children,
}: {
  value: ChatXxxContextValue;
  children: ReactNode;
}) {
  return <ChatXxxContext.Provider value={value}>{children}</ChatXxxContext.Provider>;
}

export function useChatXxx() {
  const context = useContext(ChatXxxContext);
  if (!context) {
    throw new Error("useChatXxx must be used within ChatXxxProvider");
  }
  return context;
}
```

**Step 2: 填充各 Context 类型（按功能拆分）**
- `ChatStateContext`：`messages`、`status`、`error`、`isHistoryLoading`、`stepThinking`
- `ChatSessionContext`：`sessionId`、`tabId`、`workspaceId`、`projectId`、`leafMessageId`、`branchMessageIds`、`siblingNav`
- `ChatActionsContext`：`sendMessage`、`regenerate`、`retryAssistantMessage`、`resendUserMessage`、`switchSibling`、`deleteMessageSubtree`、`stopGenerating`、`updateMessage`、`clearError`
- `ChatOptionsContext`：`input`/`setInput`、`imageOptions`/`setImageOptions`、`codexOptions`/`setCodexOptions`、`addAttachments`、`addMaskedAttachment`
- `ChatToolContext`：`toolPartsByTab`、`upsertToolPart`、`subAgentStreams`、`markToolStreaming`

**Step 3: 建立 `context/index.ts` 统一导出**
```ts
export * from "./ChatStateContext";
export * from "./ChatSessionContext";
export * from "./ChatActionsContext";
export * from "./ChatOptionsContext";
export * from "./ChatToolContext";
```

---

### Task 2: 抽离 Chat 相关 hooks（kebab-case）

**Files:**
- Create: `apps/web/src/components/chat/hooks/use-chat-branch-state.ts`
- Create: `apps/web/src/components/chat/hooks/use-chat-tool-stream.ts`
- Create: `apps/web/src/components/chat/hooks/use-chat-lifecycle.ts`
- Create: `apps/web/src/components/chat/hooks/use-chat-model-selection.ts`
- Create: `apps/web/src/components/chat/hooks/use-chat-message-composer.ts`

**Step 1: 抽离分支导航状态 `use-chat-branch-state`**
```ts
"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

export function useChatBranchState(sessionId: string) {
  // 中文注释：维护 leafMessageId / branchMessageIds / siblingNav，并提供 refresh 方法。
  const [leafMessageId, setLeafMessageId] = React.useState<string | null>(null);
  const [branchMessageIds, setBranchMessageIds] = React.useState<string[]>([]);
  const [siblingNav, setSiblingNav] = React.useState<Record<string, any>>({});
  const queryClient = useQueryClient();

  const refreshBranchMeta = React.useCallback(async (startMessageId: string) => {
    const data = await queryClient.fetchQuery(
      trpc.chat.getChatView.queryOptions({
        sessionId,
        anchor: { messageId: startMessageId, strategy: "self" },
        window: { limit: 50 },
        include: { messages: false, siblingNav: true },
        includeToolOutput: false,
      }),
    );
    setLeafMessageId(data.leafMessageId ?? null);
    setBranchMessageIds(data.branchMessageIds ?? []);
    setSiblingNav(data.siblingNav ?? {});
  }, [queryClient, sessionId]);

  return {
    leafMessageId,
    setLeafMessageId,
    branchMessageIds,
    setBranchMessageIds,
    siblingNav,
    setSiblingNav,
    refreshBranchMeta,
  };
}
```

**Step 2: 抽离工具流 `use-chat-tool-stream`**
```ts
"use client";

import * as React from "react";
import { handleChatDataPart } from "@/lib/chat/dataPart";
import { syncToolPartsFromMessages } from "@/lib/chat/toolParts";
import { createFrontendToolExecutor, registerDefaultFrontendToolHandlers } from "@/lib/chat/frontend-tool-executor";

export function useChatToolStream() {
  const executorRef = React.useRef<ReturnType<typeof createFrontendToolExecutor>>();
  if (!executorRef.current) {
    const executor = createFrontendToolExecutor();
    registerDefaultFrontendToolHandlers(executor);
    executorRef.current = executor;
  }

  const handleDataPart = React.useCallback((input: { dataPart: any; tabId?: string; upsertToolPartMerged: (key: string, next: any) => void; }) => {
    handleChatDataPart({
      dataPart: input.dataPart,
      tabId: input.tabId,
      upsertToolPartMerged: input.upsertToolPartMerged,
    });
    void executorRef.current?.executeFromDataPart({ dataPart: input.dataPart, tabId: input.tabId });
  }, []);

  const syncFromMessages = React.useCallback((input: { tabId?: string; messages: any[] }) => {
    syncToolPartsFromMessages({ tabId: input.tabId, messages: input.messages as any });
  }, []);

  const executeFromToolPart = React.useCallback((input: { part: any; tabId?: string }) => {
    return executorRef.current?.executeFromToolPart(input) ?? Promise.resolve(false);
  }, []);

  return { handleDataPart, syncFromMessages, executeFromToolPart };
}
```

**Step 3: 抽离生命周期 `use-chat-lifecycle`**
```ts
"use client";

import * as React from "react";
import { useTabSnapshotSync } from "@/hooks/use-tab-snapshot-sync";
import { useTabs, type ChatStatus } from "@/hooks/use-tabs";
import { playNotificationSound } from "@/lib/notification-sound";
import { startChatPerfLogger } from "@/lib/chat/chat-perf";

export function useChatLifecycle(input: {
  tabId?: string;
  sessionId: string;
  status: ChatStatus;
  soundEnabled: boolean;
  snapshotEnabled: boolean;
}) {
  const setTabChatStatus = useTabs((s) => s.setTabChatStatus);
  const prevStatusRef = React.useRef(input.status);

  React.useEffect(() => startChatPerfLogger({ label: "chat", intervalMs: 1000 }), []);

  React.useEffect(() => {
    const previousStatus = prevStatusRef.current;
    const wasStreaming = previousStatus === "submitted" || previousStatus === "streaming";
    const isStreaming = input.status === "submitted" || input.status === "streaming";
    prevStatusRef.current = input.status;
    if (!input.soundEnabled) return;
    if (!wasStreaming && isStreaming) playNotificationSound("model-start");
    if (wasStreaming && !isStreaming) playNotificationSound("model-end");
  }, [input.soundEnabled, input.status]);

  useTabSnapshotSync({ enabled: input.snapshotEnabled, tabId: input.tabId, sessionId: input.sessionId });

  React.useEffect(() => {
    if (!input.tabId) return;
    setTabChatStatus(input.tabId, input.status);
    return () => setTabChatStatus(input.tabId, null);
  }, [input.tabId, input.status, setTabChatStatus]);
}
```

**Step 4: 抽离模型能力 `use-chat-model-selection`**
```ts
"use client";

import * as React from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { supportsCode, supportsImageEdit, supportsImageGeneration, supportsImageInput, supportsToolCall } from "@/lib/model-capabilities";

export function useChatModelSelection() {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels],
  );
  const rawSelectedModelId = typeof basic.modelDefaultChatModelId === "string" ? basic.modelDefaultChatModelId.trim() : "";
  const selectedModel = modelOptions.find((option) => option.id === rawSelectedModelId);
  const selectedModelId = selectedModel ? rawSelectedModelId : "";
  const isAutoModel = !selectedModelId;
  const isCodeModel = supportsCode(selectedModel);
  const canAttachAll = isAutoModel || supportsToolCall(selectedModel) || isCodeModel;
  const canAttachImage = isAutoModel || supportsImageInput(selectedModel) || supportsImageEdit(selectedModel) || (supportsToolCall(selectedModel) && !isCodeModel);
  const canImageGeneration = supportsImageGeneration(selectedModel);
  const canImageEdit = supportsImageEdit(selectedModel);
  const isCodexProvider = selectedModel?.providerId === "codex-cli";

  return {
    chatModelSource,
    modelOptions,
    selectedModel,
    selectedModelId,
    isAutoModel,
    isCodeModel,
    canAttachAll,
    canAttachImage,
    canImageGeneration,
    canImageEdit,
    isCodexProvider,
  };
}
```

**Step 5: 抽离消息组装 `use-chat-message-composer`**
```ts
"use client";

import * as React from "react";
import { normalizeImageOptions } from "@/lib/chat/image-options";
import { normalizeCodexOptions } from "@/lib/chat/codex-options";

export function useChatMessageComposer(input: {
  canImageGeneration: boolean;
  isCodexProvider: boolean;
}) {
  // 中文注释：统一拼装 parts + metadata，避免 ChatInput 逻辑膨胀。
  return React.useCallback(({ textValue, attachments, imageOptions, codexOptions }: any) => {
    const imageParts = attachments ?? [];
    const normalizedImageOptions = normalizeImageOptions(imageOptions);
    const safeImageOptions = input.canImageGeneration ? normalizedImageOptions : undefined;
    const normalizedCodexOptions = input.isCodexProvider ? normalizeCodexOptions(codexOptions) : undefined;
    const metadataPayload = {
      ...(safeImageOptions ? { imageOptions: safeImageOptions } : {}),
      ...(normalizedCodexOptions ? { codexOptions: normalizedCodexOptions } : {}),
    };
    const metadata = Object.keys(metadataPayload).length > 0 ? metadataPayload : undefined;
    const parts = [
      ...imageParts,
      ...(textValue ? [{ type: "text", text: textValue }] : []),
    ];
    return { parts, metadata };
  }, [input.canImageGeneration, input.isCodexProvider]);
}
```

---

### Task 3: 重命名 ChatProvider 并切换为多 Context 输出

**Files:**
- Move: `apps/web/src/components/chat/ChatProvider.tsx` → `apps/web/src/components/chat/ChatCoreProvider.tsx`
- Modify: `apps/web/src/components/chat/Chat.tsx`

**Step 1: 迁移文件并创建新 Provider 结构**
- 保留 `useChat` 初始化与核心状态逻辑，移除旧 `ChatContext`。
- 使用 `ChatStateProvider/ChatSessionProvider/ChatActionsProvider/ChatOptionsProvider/ChatToolProvider` 包裹 children。
- 抽离后的 hooks（Task 2）注入核心数据。

**Step 2: 在 ChatCoreProvider 内完成分发**
```tsx
return (
  <ChatStateProvider value={stateValue}>
    <ChatSessionProvider value={sessionValue}>
      <ChatActionsProvider value={actionsValue}>
        <ChatOptionsProvider value={optionsValue}>
          <ChatToolProvider value={toolValue}>
            {children}
          </ChatToolProvider>
        </ChatOptionsProvider>
      </ChatActionsProvider>
    </ChatSessionProvider>
  </ChatStateProvider>
);
```

---

### Task 4: 更新 Chat.tsx 使用新 Provider 与模型选择 hook

**Files:**
- Modify: `apps/web/src/components/chat/Chat.tsx`

**Step 1: 引入 `use-chat-model-selection` 并删除重复逻辑**
- 改为使用 `useChatModelSelection()` 计算 `selectedModel`/`canAttach*`/`chatModelSource`。
- 将 `chatModelId/chatModelSource` 传给 `ChatCoreProvider`。
- 将 `selectedModel` 与能力 flags 透传给 `ChatInput`，避免 ChatInput 再次计算。

---

### Task 5: 更新 ChatInput.tsx（仅使用 Context + 传入能力）

**Files:**
- Modify: `apps/web/src/components/chat/ChatInput.tsx`

**Step 1: 用新 Context 替换旧 `useChatContext`**
- `useChatState()`：`status`、`isHistoryLoading`
- `useChatActions()`：`sendMessage`、`stopGenerating`、`clearError`
- `useChatOptions()`：`input`、`setInput`、`imageOptions`、`codexOptions`、`addMaskedAttachment`

**Step 2: 引入 `useChatMessageComposer`**
- 使用 hook 统一拼装 `parts` 与 `metadata`。
- 删除 ChatInput 内部重复的模型能力判断，仅使用 props 传入能力。

---

### Task 6: 更新消息与工具组件，切换到新 Context

**Files:**
- Modify: `apps/web/src/components/chat/ChatHeader.tsx`
- Modify: `apps/web/src/components/chat/message/MessageList.tsx`
- Modify: `apps/web/src/components/chat/message/MessageItem.tsx`
- Modify: `apps/web/src/components/chat/message/MessageHuman.tsx`
- Modify: `apps/web/src/components/chat/message/tools/UnifiedTool.tsx`
- Modify: `apps/web/src/components/chat/message/tools/MessageTool.tsx`
- Modify: `apps/web/src/components/chat/message/tools/MessageError.tsx`
- Modify: `apps/web/src/components/chat/message/tools/SubAgentTool.tsx`
- Modify: `apps/web/src/components/chat/message/tools/MessagePlan.tsx`
- Modify: `apps/web/src/components/chat/message/tools/JsonRenderTool.tsx`
- Modify: `apps/web/src/components/chat/message/tools/shared/ToolApprovalActions.tsx`

**Step 1: 替换 `useChatContext` 为对应 Context**
- `MessageList` 仅使用 `useChatState()`
- `MessageItem` 使用 `useChatState()` + `useChatSession()` + `useChatActions()`
- 工具组件使用 `useChatActions()` + `useChatTools()`

---

### Task 7: 清理旧 API 与冗余逻辑

**Files:**
- Modify: `apps/web/src/components/chat/ChatProvider.tsx`（已迁移后删除或留空）
- Modify: `apps/web/src/components/chat/ChatInput.tsx`（移除重复模型选择）
- Modify: 其他引用旧 `useChatContext` 的组件

**Step 1: 删除旧 `useChatContext` 与 `ChatContext` 定义**
- 保证全量替换后移除旧实现，避免双入口。

**Step 2: 移除重复工具/文本提取逻辑**
- `extractTextFromParts` 统一改用 `getMessagePlainText`。

---

### Task 8: 人工验证

**Step 1: 基础流程验证（手动）**
- 打开聊天，发送文本消息，确认流式显示、工具卡片显示与分支切换正常。
- 触发 `open-url`，确认工具自动执行与回执正常。

**Step 2: 可选本地检查**
- 运行：`pnpm dev:web`
- 手工验证：聊天输入、编辑重发、工具审批、子 agent 输出。
