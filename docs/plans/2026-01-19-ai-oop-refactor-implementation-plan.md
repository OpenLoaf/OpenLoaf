# AI OOP Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变现有行为的前提下，把 `apps/server/src/ai` 进行 OOP 分层重构，并完成统一异常/日志，优先落地“基础设施 + Chat 主链路”。

**Architecture:** 分层结构（interface/application/domain/infrastructure/shared），继承仅保留 `BaseUseCase` / `BaseStreamUseCase`，其余通过策略组合。先兼容旧入口，再逐步迁移与清理。

**Tech Stack:** Hono、AI SDK v6、Prisma、tRPC、Pino Logger（现有 `logger`）。

## 约束与约定（必须遵守）
- **不创建 worktree**（项目规则）。
- **跳过 TDD 测试**（项目规则），以小范围烟测代替。
- 重要逻辑必须加**中文注释**；方法/字段注释必须是**英文**。
- 行为不变：SSE 输出、消息落库顺序、模型选择策略、工具审批策略、`session_preface` hash 去重逻辑。

---

## Phase 1：基础设施 + Chat 主链路

### Task 1: shared 错误/日志基础结构 + 目录骨架

**Files:**
- Create: `apps/server/src/ai/shared/errors/ErrorCode.ts`
- Create: `apps/server/src/ai/shared/errors/AiError.ts`
- Create: `apps/server/src/ai/shared/errors/ErrorMapper.ts`
- Create: `apps/server/src/ai/shared/errors/ErrorPolicy.ts`
- Create: `apps/server/src/ai/shared/logging/LogContext.ts`
- Create: `apps/server/src/ai/shared/logging/LogEntry.ts`
- Create: `apps/server/src/ai/shared/logging/AiLogger.ts`
- Create: `apps/server/src/ai/shared/logging/TraceSpan.ts`
- Create: `apps/server/src/ai/infrastructure/adapters/AiLoggerAdapter.ts`

**Step 1: Create ErrorCode + AiError**
```ts
// apps/server/src/ai/shared/errors/ErrorCode.ts
export type ErrorCode =
  | "invalid_request"
  | "missing_session"
  | "missing_last_message"
  | "model_not_found"
  | "model_build_failed"
  | "image_request_invalid"
  | "image_generation_failed"
  | "message_save_failed"
  | "permission_denied"
  | "unknown_error";
```
```ts
// apps/server/src/ai/shared/errors/AiError.ts
import type { ErrorCode } from "./ErrorCode";

export type AiErrorContext = {
  sessionId?: string;
  workspaceId?: string;
  projectId?: string;
  requestId?: string;
  intent?: string;
  responseMode?: string;
  provider?: string;
  modelId?: string;
};

export class AiError extends Error {
  code: ErrorCode;
  context?: AiErrorContext;
  cause?: unknown;

  constructor(code: ErrorCode, message: string, context?: AiErrorContext, cause?: unknown) {
    super(message);
    this.code = code;
    this.context = context;
    this.cause = cause;
  }
}
```

**Step 2: Create ErrorMapper + ErrorPolicy**
```ts
// apps/server/src/ai/shared/errors/ErrorMapper.ts
import type { AiError } from "./AiError";

export function mapErrorToMessage(error: AiError | unknown): string {
  if (error instanceof Error) return error.message;
  return "请求失败：发生未知错误。";
}
```
```ts
// apps/server/src/ai/shared/errors/ErrorPolicy.ts
import { mapErrorToMessage } from "./ErrorMapper";

export type ErrorPolicyResult = {
  status: number;
  message: string;
};

export function toHttpError(error: unknown, fallbackStatus = 500): ErrorPolicyResult {
  return { status: fallbackStatus, message: mapErrorToMessage(error) };
}
```

**Step 3: Add logging interfaces + adapter**
```ts
// apps/server/src/ai/shared/logging/AiLogger.ts
import type { LogContext } from "./LogContext";
import type { LogEntry } from "./LogEntry";

export interface AiLogger {
  log(entry: LogEntry): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}
```
```ts
// apps/server/src/ai/infrastructure/adapters/AiLoggerAdapter.ts
import { logger } from "@/common/logger";
import type { AiLogger } from "@/ai/shared/logging/AiLogger";
import type { LogContext } from "@/ai/shared/logging/LogContext";
import type { LogEntry } from "@/ai/shared/logging/LogEntry";

export class AiLoggerAdapter implements AiLogger {
  log(entry: LogEntry) {
    logger[entry.level]({ context: entry.context, error: entry.error }, entry.message);
  }
  debug(message: string, context?: LogContext) { this.log({ level: "debug", message, context }); }
  info(message: string, context?: LogContext) { this.log({ level: "info", message, context }); }
  warn(message: string, context?: LogContext) { this.log({ level: "warn", message, context }); }
  error(message: string, context?: LogContext) { this.log({ level: "error", message, context }); }
}
```

**Step 4: Commit**
```bash
git add apps/server/src/ai/shared apps/server/src/ai/infrastructure/adapters/AiLoggerAdapter.ts
git commit -m "refactor(ai): add shared errors/logging"
```

---

### Task 2: Ports + Adapters（最小可用骨架）

**Files:**
- Create: `apps/server/src/ai/application/ports/MessageRepository.ts`
- Create: `apps/server/src/ai/application/ports/SessionRepository.ts`
- Create: `apps/server/src/ai/application/ports/AttachmentResolverPort.ts`
- Create: `apps/server/src/ai/application/ports/AuthGateway.ts`
- Create: `apps/server/src/ai/application/ports/SettingsRepository.ts`
- Create: `apps/server/src/ai/application/ports/VfsGateway.ts`
- Create: `apps/server/src/ai/infrastructure/repositories/PrismaMessageRepository.ts`
- Create: `apps/server/src/ai/infrastructure/repositories/PrismaSessionRepository.ts`
- Create: `apps/server/src/ai/infrastructure/adapters/AttachmentResolverAdapter.ts`
- Create: `apps/server/src/ai/infrastructure/gateways/AuthSessionGateway.ts`
- Create: `apps/server/src/ai/infrastructure/gateways/SettingsGateway.ts`
- Create: `apps/server/src/ai/infrastructure/gateways/VfsGatewayImpl.ts`

**Step 1: Define ports**
```ts
// apps/server/src/ai/application/ports/MessageRepository.ts
import type { TenasUIMessage } from "@tenas-ai/api/types/message";

export interface MessageRepository {
  ensurePreface(input: { sessionId: string; message: TenasUIMessage }): Promise<string | null>;
  saveMessage(input: { sessionId: string; message: TenasUIMessage; parentMessageId: string | null }): Promise<void>;
}
```

**Step 2: Implement adapters using existing helpers**
```ts
// apps/server/src/ai/infrastructure/repositories/PrismaMessageRepository.ts
import type { MessageRepository } from "@/ai/application/ports/MessageRepository";
import { ensureSessionPreface, saveMessage } from "@/ai/chat-stream/messageStore";

export class PrismaMessageRepository implements MessageRepository {
  async ensurePreface(input: { sessionId: string; message: any }) {
    return ensureSessionPreface({ sessionId: input.sessionId, message: input.message });
  }
  async saveMessage(input: { sessionId: string; message: any; parentMessageId: string | null }) {
    await saveMessage({ sessionId: input.sessionId, message: input.message, parentMessageId: input.parentMessageId });
  }
}
```

**Step 3: Commit**
```bash
git add apps/server/src/ai/application/ports apps/server/src/ai/infrastructure
git commit -m "refactor(ai): add ports and adapters"
```

---

### Task 3: RequestScope + PromptContext 基础对象

**Files:**
- Create: `apps/server/src/ai/domain/entities/PromptContext.ts`
- Create: `apps/server/src/ai/domain/value-objects/RequestScope.ts`

**Step 1: Add RequestScope**
```ts
// apps/server/src/ai/domain/value-objects/RequestScope.ts
export type RequestScope = {
  sessionId: string;
  workspaceId?: string;
  projectId?: string;
  boardId?: string;
  clientId?: string;
  tabId?: string;
  requestId?: string;
  selectedSkills?: string[];
  parentProjectRootPaths?: string[];
};
```

**Step 2: Add PromptContext**
```ts
// apps/server/src/ai/domain/entities/PromptContext.ts
export type PromptContext = {
  workspace: { id: string; name: string; rootPath: string };
  project: { id: string; name: string; rootPath: string; rules: string };
  account: { id: string; name: string; email: string };
  responseLanguage: string;
  platform: string;
  date: string;
  python: { installed: boolean; version?: string; path?: string };
  skillSummaries: Array<{ name: string; scope: string; description: string; path: string }>;
  selectedSkills: string[];
};
```

**Step 3: Commit**
```bash
git add apps/server/src/ai/domain
git commit -m "refactor(ai): add RequestScope and PromptContext"
```

---

### Task 4: PromptBuilder / PrefaceBuilder（抽离 chatStreamService）

**Files:**
- Create: `apps/server/src/ai/domain/services/PrefaceBuilder.ts`
- Create: `apps/server/src/ai/domain/services/PromptBuilder.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamService.ts`
- Modify: `apps/server/src/ai/agents/masterAgent/masterAgent.ts`

**Step 1: Create builders**
```ts
// apps/server/src/ai/domain/services/PromptBuilder.ts
import type { PromptContext } from "@/ai/domain/entities/PromptContext";

export function buildMasterAgentSections(context: PromptContext): string[] {
  return [
    [
      "# 语言强制",
      `- 当前输出语言：${context.responseLanguage}`,
      "- 你的所有输出必须严格使用上述语言，不得混用或夹杂其他语言。",
    ].join("\n"),
  ];
}
```

**Step 2: Update chatStreamService**
- 把原 `resolvePromptContext`、`buildMasterAgentContextSections` 迁出并调用新 builder。
- 未登录显示改为 **"未登录"**。
- 跨项目文件引用格式统一为 `@[projectId]/path`。

**Step 3: Update masterAgent**
- `instructions` 只使用 `readMasterAgentBasePrompt()`。

**Step 4: Commit**
```bash
git add apps/server/src/ai/domain/services apps/server/src/ai/chat-stream/chatStreamService.ts apps/server/src/ai/agents/masterAgent/masterAgent.ts
git commit -m "refactor(ai): extract prompt builders"
```

---

### Task 5: ModelSelectionService + ToolsetAssembler

**Files:**
- Create: `apps/server/src/ai/application/services/ModelSelectionService.ts`
- Create: `apps/server/src/ai/application/services/ToolsetAssembler.ts`
- Modify: `apps/server/src/ai/registry/toolRegistry.ts`

**Step 1: Add services**
```ts
// apps/server/src/ai/application/services/ModelSelectionService.ts
import { resolveChatModel } from "@/ai/resolveChatModel";

export class ModelSelectionService {
  async resolve(input: Parameters<typeof resolveChatModel>[0]) {
    return resolveChatModel(input);
  }
}
```
```ts
// apps/server/src/ai/application/services/ToolsetAssembler.ts
import { buildToolset } from "@/ai/registry/toolRegistry";

export class ToolsetAssembler {
  assemble(toolIds: readonly string[]) {
    return buildToolset(toolIds);
  }
}
```

**Step 2: Prepare per-command/agent tool selection**
- 在 command/agent 调用路径增加 `toolIds` 入参透传（行为保持不变）。

**Step 3: Commit**
```bash
git add apps/server/src/ai/application/services apps/server/src/ai/registry/toolRegistry.ts
git commit -m "refactor(ai): add model/toolset services"
```

---

### Task 6: BaseUseCase / BaseStreamUseCase + ChatStreamUseCase

**Files:**
- Create: `apps/server/src/ai/application/use-cases/BaseUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/BaseStreamUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/ChatStreamUseCase.ts`
- Modify: `apps/server/src/ai/pipeline/aiPipeline.ts`

**Step 1: Add BaseUseCase skeleton**
```ts
// apps/server/src/ai/application/use-cases/BaseUseCase.ts
import { toHttpError } from "@/ai/shared/errors/ErrorPolicy";

export abstract class BaseUseCase<TRequest, TResponse> {
  abstract execute(request: TRequest): Promise<TResponse>;
  protected handleError(error: unknown): never {
    throw new Error(toHttpError(error).message);
  }
}
```

**Step 2: Add ChatStreamUseCase wrapper**
```ts
// apps/server/src/ai/application/use-cases/ChatStreamUseCase.ts
import { runChatStream } from "@/ai/chat-stream/chatStreamService";
import type { ChatStreamRequest } from "@/ai/chat-stream/chatStreamTypes";

export class ChatStreamUseCase {
  async execute(input: { request: ChatStreamRequest; cookies: Record<string,string>; requestSignal: AbortSignal }) {
    return runChatStream(input);
  }
}
```

**Step 3: Route aiPipeline to use-case**
- `runAiExecute` 里调用 `ChatStreamUseCase`。

**Step 4: Commit**
```bash
git add apps/server/src/ai/application/use-cases apps/server/src/ai/pipeline/aiPipeline.ts
git commit -m "refactor(ai): wrap chat stream into use-case"
```

---

### Task 7: AiExecuteService + 接入路由

**Files:**
- Create: `apps/server/src/ai/application/use-cases/AiExecuteService.ts`
- Modify: `apps/server/src/routers/aiExecuteRoutes.ts`

**Step 1: Create AiExecuteService**
```ts
// apps/server/src/ai/application/use-cases/AiExecuteService.ts
import type { AiExecuteRequest } from "@/ai/pipeline/aiTypes";
import { runAiExecute } from "@/ai/pipeline/aiPipeline";

export class AiExecuteService {
  async execute(input: { request: AiExecuteRequest; cookies: Record<string,string>; requestSignal: AbortSignal }) {
    return runAiExecute(input);
  }
}
```

**Step 2: Update route**
- `aiExecuteRoutes.ts` 改为 `new AiExecuteService().execute(...)`。

**Step 3: Commit**
```bash
git add apps/server/src/ai/application/use-cases/AiExecuteService.ts apps/server/src/routers/aiExecuteRoutes.ts
git commit -m "refactor(ai): add AiExecuteService entry"
```

---

## Phase 2：Summary / Image / Attachment

### Task 8: SummaryTitleUseCase / SummaryHistoryUseCase

**Files:**
- Create: `apps/server/src/ai/application/use-cases/SummaryTitleUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/SummaryHistoryUseCase.ts`
- Modify: `apps/server/src/ai/pipeline/aiPipeline.ts`

**Step 1: Extract summary-title logic into use-case**
- 从 `aiPipeline.ts` 中移动 `runSummaryTitleCommand` 到 `SummaryTitleUseCase`。

**Step 2: Replace in aiPipeline**
- `runAiExecute` 调用 use-case。

**Step 3: Commit**
```bash
git add apps/server/src/ai/application/use-cases/SummaryTitleUseCase.ts apps/server/src/ai/application/use-cases/SummaryHistoryUseCase.ts apps/server/src/ai/pipeline/aiPipeline.ts
git commit -m "refactor(ai): move summary commands into use-cases"
```

---

### Task 9: ImageRequestUseCase

**Files:**
- Create: `apps/server/src/ai/application/use-cases/ImageRequestUseCase.ts`
- Modify: `apps/server/src/ai/pipeline/aiPipeline.ts`

**Step 1: Extract image request to use-case**
```ts
// apps/server/src/ai/application/use-cases/ImageRequestUseCase.ts
import type { ChatImageRequest } from "@/ai/chat-stream/chatImageTypes";
import { runChatImageRequest } from "@/ai/chat-stream/chatStreamService";

export class ImageRequestUseCase {
  async execute(input: { request: ChatImageRequest; cookies: Record<string,string>; requestSignal: AbortSignal }) {
    return runChatImageRequest(input);
  }
}
```

**Step 2: Replace in aiPipeline**
- `intent=image && responseMode=json` 改为 use-case 调用。

**Step 3: Commit**
```bash
git add apps/server/src/ai/application/use-cases/ImageRequestUseCase.ts apps/server/src/ai/pipeline/aiPipeline.ts
git commit -m "refactor(ai): wrap image request into use-case"
```

---

### Task 10: ChatAttachmentController（薄封装）

**Files:**
- Create: `apps/server/src/ai/interface/controllers/ChatAttachmentController.ts`
- Modify: `apps/server/src/ai/chat-stream/chatAttachmentRoutes.ts`

**Step 1: Create controller**
```ts
// apps/server/src/ai/interface/controllers/ChatAttachmentController.ts
export class ChatAttachmentController {
  // 先做薄封装，后续可拆成 UseCase
}
```

**Step 2: Routes delegate**
- `chatAttachmentRoutes.ts` 内部改调用 controller。

**Step 3: Commit**
```bash
git add apps/server/src/ai/interface/controllers/ChatAttachmentController.ts apps/server/src/ai/chat-stream/chatAttachmentRoutes.ts
git commit -m "refactor(ai): add chat attachment controller"
```

---

## Phase 3：清理阶段

### Task 11: 迁移 imports + 删除冗余代码

**Files:**
- Modify: `apps/server/src/ai/index.ts`
- Modify: `apps/server/src/ai/pipeline/*`
- Modify: `apps/server/src/ai/chat-stream/*`
- Modify: `apps/server/src/ai/agents/masterAgent/masterAgent.ts`

**Step 1: 旧入口转发到新层**
- `apps/server/src/ai/index.ts` 统一 re-export 新层入口。

**Step 2: 清理未使用代码**
- 删除 masterAgent 中未使用常量与函数（保持行为不变）。

**Step 3: Commit**
```bash
git add apps/server/src/ai
git commit -m "refactor(ai): cleanup legacy paths"
```

---

## 最小验证（不做 TDD）
- 阶段末执行：
  1) `pnpm check-types`
  2) 手动请求 `/ai/execute`（chat）与 `/chat/attachments` 上传/预览

---

## 未来功能占位（不实现，仅结构保留）
- `/summary-project` / `/update-project-summary` / `/summary-day`
- `/expand-context-*`（一次性文本，不落库）
- `/helper-project` / `/helper-workspace`
- 视频生成、后台任务状态展示、双通道调度

