# AI Slim Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flatten `apps/server/src/ai` into capability-centric modules, replace the `AiModule` composition root with `bootstrap.ts`, rename capability ports entry files to `index.ts`, and update imports to the new structure without changing runtime behavior.

**Architecture:** Keep `interface/` as HTTP entry, add a single `bootstrap.ts` for dependency assembly, and move use-cases/services into capability folders (`chat/summary/image/video/tools/models/agents`). Capability-level `index.ts` holds port interfaces and exports. Cross-cutting basics stay in `shared/`.

**Tech Stack:** TypeScript, Hono, Prisma, AI SDK v6

**Project Rule Note:** 按项目规则，跳过 TDD 测试与 worktree，直接在当前分支修改。

---

### Task 0: Replace `AiModule` with `bootstrap.ts` (done)

**Files:**
- Create: `apps/server/src/ai/bootstrap.ts`
- Modify: `apps/server/src/ai/interface/routes/aiExecuteRoutes.ts`
- Modify: `apps/server/src/ai/index.ts`
- Delete: `apps/server/src/ai/composition/AiModule.ts`

**Step 1: Create `bootstrap.ts` with a single composition function**
```ts
export function bootstrapAi(): { aiExecuteController: AiExecuteController } {
  // 逻辑：集中构建 AI 控制器与依赖，避免散落的模块装配。
  const executeService = new AiExecuteService();
  return { aiExecuteController: new AiExecuteController({ executeService }) };
}
```

**Step 2: Update route to use bootstrap result**
```ts
const { aiExecuteController: controller } = bootstrapAi();
```

**Step 3: Re-export `bootstrap.ts` from `ai/index.ts`**

---

### Task 1: Create capability folders and move chat files

**Files:**
- Move: `apps/server/src/ai/application/use-cases/AiExecuteService.ts` → `apps/server/src/ai/chat/AiExecuteService.ts`
- Move: `apps/server/src/ai/application/use-cases/ChatStreamUseCase.ts` → `apps/server/src/ai/chat/ChatStreamUseCase.ts`
- Move: `apps/server/src/ai/application/services/chatStream/*` → `apps/server/src/ai/chat/*`
- Move: `apps/server/src/ai/application/dto/chatStreamTypes.ts` → `apps/server/src/ai/chat/types.ts`
- Create: `apps/server/src/ai/chat/index.ts`

**Step 1: Create `chat/` directory and move files (use mv)**

**Step 2: Update imports inside moved files**
- Replace old paths from `@/ai/application/...` to `@/ai/chat/...`

**Step 3: Create `chat/index.ts` with port interfaces used by chat**
```ts
export type ChatDeps = {
  messageRepository: MessageRepository;
  sessionRepository: SessionRepository;
  toolRegistry: ToolRegistryPort;
  modelRegistry: ModelRegistryPort;
  agentRunner: AgentRunnerPort;
};
```

---

### Task 2: Move summary files into `summary/`

**Files:**
- Move: `apps/server/src/ai/application/use-cases/SummaryHistoryUseCase.ts` → `apps/server/src/ai/summary/SummaryHistoryUseCase.ts`
- Move: `apps/server/src/ai/application/use-cases/SummaryTitleUseCase.ts` → `apps/server/src/ai/summary/SummaryTitleUseCase.ts`
- Move: `apps/server/src/ai/application/use-cases/SummaryProjectUseCase.ts` → `apps/server/src/ai/summary/SummaryProjectUseCase.ts`
- Move: `apps/server/src/ai/application/use-cases/UpdateProjectSummaryUseCase.ts` → `apps/server/src/ai/summary/UpdateProjectSummaryUseCase.ts`
- Move: `apps/server/src/ai/application/use-cases/SummaryDayUseCase.ts` → `apps/server/src/ai/summary/SummaryDayUseCase.ts`
- Move: `apps/server/src/ai/application/services/summary/*` → `apps/server/src/ai/summary/*`
- Move: `apps/server/src/ai/application/dto/aiTypes.ts` (summary subset) → `apps/server/src/ai/summary/types.ts`
- Create: `apps/server/src/ai/summary/index.ts`

**Step 1: Move summary use-cases/services**

**Step 2: Update imports inside moved files**

**Step 3: Create `summary/index.ts` with summary ports**

---

### Task 3: Move image & video files into `image/` and `video/`

**Files:**
- Move: `apps/server/src/ai/application/use-cases/ImageRequestUseCase.ts` → `apps/server/src/ai/image/ImageRequestUseCase.ts`
- Move: `apps/server/src/ai/application/use-cases/VideoRequestUseCase.ts` → `apps/server/src/ai/video/VideoRequestUseCase.ts`
- Move: `apps/server/src/ai/application/dto/chatImageTypes.ts` → `apps/server/src/ai/image/types.ts`
- Move: `apps/server/src/ai/infrastructure/adapters/imageEditNormalizer.ts` → `apps/server/src/ai/image/ImageEditNormalizer.ts`
- Move: `apps/server/src/ai/infrastructure/adapters/imageStorage.ts` → `apps/server/src/ai/image/ImageStorage.ts`
- Create: `apps/server/src/ai/image/index.ts`
- Create: `apps/server/src/ai/video/index.ts`

**Step 1: Move image/video files**

**Step 2: Update imports**

---

### Task 4: Move tools & registry into `tools/`

**Files:**
- Move: `apps/server/src/ai/application/services/ToolsetAssembler.ts` → `apps/server/src/ai/tools/ToolsetAssembler.ts`
- Move: `apps/server/src/ai/domain/services/CommandParser.ts` → `apps/server/src/ai/tools/CommandParser.ts`
- Move: `apps/server/src/ai/domain/services/SkillSelector.ts` → `apps/server/src/ai/tools/SkillSelector.ts`
- Move: `apps/server/src/ai/registry/toolRegistry.ts` → `apps/server/src/ai/tools/toolRegistry.ts`
- Move: `apps/server/src/ai/registry/policies.ts` → `apps/server/src/ai/tools/policies.ts`
- Create: `apps/server/src/ai/tools/index.ts`

---

### Task 5: Move model layer into `models/`

**Files:**
- Move: `apps/server/src/ai/application/services/ModelSelectionService.ts` → `apps/server/src/ai/models/ModelSelectionService.ts`
- Move: `apps/server/src/ai/infrastructure/adapters/ModelRegistryAdapter.ts` → `apps/server/src/ai/models/ModelRegistryAdapter.ts`
- Move: `apps/server/src/ai/infrastructure/adapters/ProviderAdapterRegistry.ts` → `apps/server/src/ai/models/ProviderAdapterRegistry.ts`
- Keep: `apps/server/src/ai/models/*` under `apps/server/src/ai/models/`
- Create: `apps/server/src/ai/models/index.ts`

---

### Task 6: Move agents into `agents/`

**Files:**
- Move: `apps/server/src/ai/infrastructure/adapters/AgentRunnerAdapter.ts` → `apps/server/src/ai/agents/AgentRunnerAdapter.ts`
- Keep: `apps/server/src/ai/agents/*`
- Create: `apps/server/src/ai/agents/index.ts`

---

### Task 7: Move shared infrastructure into `shared/`

**Files:**
- Move: `apps/server/src/ai/infrastructure/repositories/*` → `apps/server/src/ai/shared/repositories/*`
- Move: `apps/server/src/ai/infrastructure/gateways/*` → `apps/server/src/ai/shared/gateways/*`
- Keep: `apps/server/src/ai/shared/errors/*` and `apps/server/src/ai/shared/logging/*`
- Move: `apps/server/src/ai/domain/services/MessageChainBuilder.ts` → `apps/server/src/ai/shared/MessageChainBuilder.ts`
- Move: `apps/server/src/ai/domain/services/promptBuilder.ts` → `apps/server/src/ai/shared/PromptBuilder.ts`
- Move: `apps/server/src/ai/domain/services/prefaceBuilder.ts` → `apps/server/src/ai/shared/PrefaceBuilder.ts`
- Move: `apps/server/src/ai/domain/value-objects/RequestScope.ts` → `apps/server/src/ai/shared/types.ts`

---

### Task 8: Update imports & remove old directories

**Files:**
- Modify: `apps/server/src/ai/index.ts`
- Modify: all moved files to match new import paths
- Delete: empty dirs under `application/`, `domain/`, `infrastructure/`, `composition/`, `registry/`

**Step 1: Use `rg "@/ai/application"` and `rg "@/ai/domain"` to update paths**

**Step 2: Remove empty directories**

---

### Task 9: Optional verification

**Note:** 按项目规则暂不执行。如需验证，建议运行：`pnpm check-types`.
