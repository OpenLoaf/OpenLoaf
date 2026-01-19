# AI OOP Refactor Structure Fill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐 `docs/plans/2026-01-19-ai-oop-refactor-design.md` 中尚未落地的分层结构（接口/端口/实体/适配器占位），不改变现有行为。

**Architecture:** 仅新增/补全 OOP 分层结构与类型契约，旧路径保持兼容；不改动运行时逻辑流，仅提供最小可用骨架与 re-export。

**Tech Stack:** TypeScript, Hono, Prisma, AI SDK v6, Pino Logger.

## 约束与约定
- 不创建 worktree。
- 跳过 TDD，以最小验证替代（`pnpm check-types`）。
- 重要逻辑中文注释；方法/字段注释英文。
- 不改变行为：SSE 输出、消息落库顺序、模型选择策略、工具审批策略、`session_preface` hash 去重逻辑。

---

## Phase A：Interface & Composition

### Task 1: 添加 composition 与 controller/route 结构占位

**Files:**
- Create: `apps/server/src/ai/composition/AiModule.ts`
- Create: `apps/server/src/ai/interface/controllers/AiExecuteController.ts`
- Create: `apps/server/src/ai/interface/routes/aiExecuteRoutes.ts`
- Create: `apps/server/src/ai/interface/routes/chatAttachmentRoutes.ts`
- Modify: `apps/server/src/ai/index.ts`

**Step 1: Create AiModule.ts**
```ts
// 仅导出组装入口，占位，不改动现有 wiring。
export class AiModule {}
```

**Step 2: Create AiExecuteController.ts**
```ts
export class AiExecuteController {
  /** Execute AI request. */
  execute(): void {
    // 中文注释：接口层占位，实际逻辑仍走现有 service。
  }
}
```

**Step 3: Create route wrappers**
```ts
// aiExecuteRoutes.ts / chatAttachmentRoutes.ts
// 中文注释：仅保留接口层文件结构，转发到旧路由实现。
export { default } from "@/ai/routers/aiExecuteRoutes"; // 示例，按现有路径替换
```

**Step 4: Update ai/index.ts exports**
- re-export 新 interface/composition。

**Step 5: Commit**
```bash
git add apps/server/src/ai/composition/AiModule.ts apps/server/src/ai/interface apps/server/src/ai/index.ts
git commit -m "refactor(ai): add interface/composition skeleton"
```

---

## Phase B：Application Ports & Services

### Task 2: 补齐剩余 Ports/Services 占位

**Files:**
- Create: `apps/server/src/ai/application/ports/AgentRunnerPort.ts`
- Create: `apps/server/src/ai/application/ports/ModelRegistryPort.ts`
- Create: `apps/server/src/ai/application/ports/SchedulerPort.ts`
- Create: `apps/server/src/ai/application/ports/TaskStatusRepository.ts`
- Create: `apps/server/src/ai/application/ports/ToolRegistryPort.ts`
- Create: `apps/server/src/ai/application/services/BackgroundTaskService.ts`

**Step 1: Define minimal interfaces**
```ts
export interface AgentRunnerPort {}
```
(其余按需要补齐最小签名，不触发行为改动)

**Step 2: BackgroundTaskService 占位**
```ts
export class BackgroundTaskService {
  /** Execute background task. */
  async run(): Promise<void> {
    // 中文注释：占位实现。
  }
}
```

**Step 3: Commit**
```bash
git add apps/server/src/ai/application/ports apps/server/src/ai/application/services/BackgroundTaskService.ts
git commit -m "refactor(ai): add remaining ports/services skeleton"
```

---

## Phase C：Application Use-Cases 占位

### Task 3: 新增未落地的 use-cases 结构

**Files:**
- Create: `apps/server/src/ai/application/use-cases/ContextExpansionUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/HelperProjectUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/HelperWorkspaceUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/SummaryProjectUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/SummaryDayUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/UpdateProjectSummaryUseCase.ts`
- Create: `apps/server/src/ai/application/use-cases/VideoRequestUseCase.ts`

**Step 1: Add placeholder classes**
```ts
export class ContextExpansionUseCase {
  /** Execute context expansion. */
  async execute(): Promise<void> {
    // 中文注释：占位实现。
  }
}
```

**Step 2: Commit**
```bash
git add apps/server/src/ai/application/use-cases
git commit -m "refactor(ai): add remaining use-case skeletons"
```

---

## Phase D：Domain Entities/Services/Value Objects

### Task 4: 补齐 Domain 结构占位

**Files:**
- Create: `apps/server/src/ai/domain/entities/ChatMessage.ts`
- Create: `apps/server/src/ai/domain/entities/MessageKind.ts`
- Create: `apps/server/src/ai/domain/entities/ProjectSummary.ts`
- Create: `apps/server/src/ai/domain/entities/ScheduleJob.ts`
- Create: `apps/server/src/ai/domain/entities/TaskStatus.ts`
- Create: `apps/server/src/ai/domain/entities/SkillSummary.ts`
- Create: `apps/server/src/ai/domain/entities/ModelCandidate.ts`
- Create: `apps/server/src/ai/domain/services/CommandParser.ts`
- Create: `apps/server/src/ai/domain/services/MessageChainBuilder.ts`
- Create: `apps/server/src/ai/domain/services/SkillSelector.ts`
- Create: `apps/server/src/ai/domain/value-objects/AttachmentRef.ts`
- Create: `apps/server/src/ai/domain/value-objects/ModelSelectionSpec.ts`
- Create: `apps/server/src/ai/domain/value-objects/ToolsetSpec.ts`

**Step 1: Minimal type definitions**
```ts
export type TaskStatus = "pending" | "running" | "completed" | "failed";
```

**Step 2: Commit**
```bash
git add apps/server/src/ai/domain
git commit -m "refactor(ai): add remaining domain skeletons"
```

---

## Phase E：Infrastructure Adapters/Repositories

### Task 5: 补齐 adapters/repositories 占位

**Files:**
- Create: `apps/server/src/ai/infrastructure/adapters/AgentRunnerAdapter.ts`
- Create: `apps/server/src/ai/infrastructure/adapters/ModelRegistryAdapter.ts`
- Create: `apps/server/src/ai/infrastructure/adapters/ProviderAdapterRegistry.ts`
- Create: `apps/server/src/ai/infrastructure/adapters/SchedulerAdapters.ts`
- Create: `apps/server/src/ai/infrastructure/adapters/ToolRegistryAdapter.ts`
- Create: `apps/server/src/ai/infrastructure/repositories/PrismaJobRepository.ts`
- Create: `apps/server/src/ai/infrastructure/repositories/PrismaTaskStatusRepository.ts`

**Step 1: Minimal class shells**
```ts
export class AgentRunnerAdapter {}
```

**Step 2: Commit**
```bash
git add apps/server/src/ai/infrastructure
git commit -m "refactor(ai): add remaining infra skeletons"
```

---

## Phase F：最小验证

### Task 6: 类型检查

**Step 1: Run**
```bash
pnpm check-types
```

**Expected:** 全部通过。

**Step 2: Commit (if needed)**
```bash
# 若有额外修复
# git add ...
# git commit -m "refactor(ai): fix types after structure fill"
```

---

# Execution Handoff

Plan complete and saved to `docs/plans/2026-01-19-ai-oop-refactor-structure-fill.md`.

Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
