# AI 目录简化重构设计（A 方案：能力纵向聚合）

目标：在不改变现有功能与行为的前提下，压缩 `apps/server/src/ai` 的层级与文件分散度，做到高内聚、低耦合、低跳转成本；移除仅作包装的目录与单方法文件（如 `composition/AiModule.ts`）。

## 1. 背景与问题

- 当前 `application/domain/infrastructure/composition/registry` 层级过深，导航与理解成本高。
- 多个目录仅承担“归档层”角色，出现单方法/单类文件，造成结构噪音。
- 跨层跳转多，无法在单一能力目录内完成闭环理解与修改。

## 2. 目标与约束

- 目标：顶层按能力聚合；目录深度控制在 2~3；types 与 ports 按能力内聚。
- 约束：不改现有行为与对外输出（SSE 结构、消息持久化顺序、模型解析策略、工具审批、preface hash 规则、技能加载顺序等）。
- 过渡：允许先“迁移结构 + re-export”，再逐步收敛引用路径。

## 3. 总体方案（能力纵向聚合）

- 顶层按能力组织：`chat/summary/image/video/agents/tools/models/runtime`。
- `index.ts` / `types.ts` 按能力放置，**由能力拥有者定义**；其它能力需依赖则从该能力 `index.ts` 引用，禁止重复定义；ports 按能力归属放置。
- 跨能力复用的少量基础能力放 `shared/`（errors/logging/少量通用类型），避免再引入多层分域目录。
- `composition/` 移除，使用单一入口 `bootstrap.ts` 组装依赖。

## 4. 目标目录结构（草案）

```
apps/server/src/ai/
  bootstrap.ts
  index.ts
  interface/
    controllers/
    routes/
  chat/
    AuthGateway.ts
    MessageRepository.ts
    SessionRepository.ts
    SettingsRepository.ts
    VfsGateway.ts
    ChatStreamUseCase.ts
    AiExecuteService.ts
    ContextExpansionUseCase.ts
    HelperProjectUseCase.ts
    HelperWorkspaceUseCase.ts
    gateways/
      AuthSessionGateway.ts
      SettingsGateway.ts
      VfsGatewayImpl.ts
    repositories/
      messageStore.ts
      messageChainLoader.ts
      PrismaMessageRepository.ts
      PrismaSessionRepository.ts
    streamOrchestrator.ts
    metadataBuilder.ts
    messageOptionResolver.ts
    types.ts
    index.ts
  summary/
    SchedulerPort.ts
    TaskStatusRepository.ts
    SummaryHistoryUseCase.ts
    SummaryTitleUseCase.ts
    SummaryProjectUseCase.ts
    UpdateProjectSummaryUseCase.ts
    SummaryDayUseCase.ts
    BackgroundTaskService.ts
    SchedulerAdapters.ts
    repositories/
      InMemoryTaskStatusRepository.ts
      PrismaTaskStatusRepository.ts
      PrismaJobRepository.ts
    summaryGenerator.ts
    summaryScheduler.ts
    index.ts
  image/
    AttachmentResolverPort.ts
    AttachmentResolverAdapter.ts
    ImageRequestUseCase.ts
    imagePrompt.ts
    imageEditNormalizer.ts
    imageStorage.ts
    attachmentResolver.ts
    types.ts
    index.ts
  video/
    VideoRequestUseCase.ts
    index.ts
  agents/
    AgentRunnerPort.ts
    masterAgent/
    subagent/
    AgentRunnerAdapter.ts
    index.ts
  tools/
    ToolRegistryPort.ts
    ToolsetAssembler.ts
    CommandParser.ts
    SkillSelector.ts
    toolRegistry.ts
    policies.ts
    runtime/
    ui/
    system/
    delegation/
    frontend/
    test/
    index.ts
  models/
    ModelRegistryPort.ts
    modelRegistry.ts
    providerAdapters.ts
    providerRequestRunner.ts
    resolveChatModel.ts
    resolveImageModel.ts
    ModelSelectionService.ts
    openaiCompatible/
    qwen/
    volcengine/
    cli/
    index.ts
  runtime/
    runtimeUi.ts
    runtimeCommand.ts
  shared/
    errors/
    logging/
    context/
    BaseUseCase.ts
    BaseStreamUseCase.ts
    MessageChainBuilder.ts
    prefaceBuilder.ts
    promptBuilder.ts
    messageConverter.ts
    types.ts
```

## 5. 依赖边界与耦合规则

- 入口：`interface/*` 只依赖 `bootstrap.ts` 暴露的服务集合。
- 能力：能力目录只依赖 `shared/` 与 `models/tools/agents` 横向能力；横向能力 **不得反向依赖** `chat/summary/image`。
- 共享：`shared/` 不依赖任何能力目录。
- ports 归属：ports 放在能力目录内，由能力 `index.ts` 聚合并暴露；跨能力引用必须通过对方 `index.ts`。
- 禁止重新引入 `application/domain/infrastructure` 层级。

## 6. 组合入口 `bootstrap.ts`

`bootstrap.ts` 是唯一组合根：构建 logger/errorPolicy/repository/gateway/modelRegistry/toolRegistry/agentRunner，并调用各能力的 `createXxxServices(deps)` 返回服务集合。`interface/routes` 只访问该集合。禁止新增 `AiModule.ts` 这类单方法包装层。

## 7. 迁移清单（目录与关键文件映射）

### 7.1 目录级迁移

- `apps/server/src/ai/composition` → **删除**，以 `apps/server/src/ai/bootstrap.ts` 替代。
- `apps/server/src/ai/application/use-cases/*` → 按能力迁入 `chat/summary/image/video/`。
- `apps/server/src/ai/application/services/chatStream/*` → `apps/server/src/ai/chat/*`。
- `apps/server/src/ai/application/services/summary/*` → `apps/server/src/ai/summary/*`。
- `apps/server/src/ai/application/services/{ToolsetAssembler,ModelSelectionService}.ts` → `tools/` 与 `models/`。
- `apps/server/src/ai/application/dto/*` → `chat/types.ts`、`image/types.ts` 或 `shared/types.ts`。
- `apps/server/src/ai/application/ports/*` → 按能力迁入 `chat/summary/image/tools/models/agents/`。
- `apps/server/src/ai/domain/services/*` → `tools/` 或 `shared/` 或能力内。
- `apps/server/src/ai/domain/entities/*` → `shared/types.ts`。
- `apps/server/src/ai/domain/value-objects/*` → `shared/types.ts`。
- `apps/server/src/ai/infrastructure/repositories/*` → `chat/repositories/*` 与 `summary/repositories/*`。
- `apps/server/src/ai/infrastructure/gateways/*` → `chat/gateways/*`（认证/设置/VFS 访问）。
- `apps/server/src/ai/infrastructure/adapters/*` → 归属能力目录（`agents/`、`models/`、`tools/`、`image/`、`summary/`、`shared/logging/`）。
- `apps/server/src/ai/registry/*` → `apps/server/src/ai/tools/{toolRegistry.ts,policies.ts}`。

### 7.2 关键文件迁移（示例）

- `ai/application/use-cases/ChatStreamUseCase.ts` → `ai/chat/ChatStreamUseCase.ts`
- `ai/application/use-cases/AiExecuteService.ts` → `ai/chat/AiExecuteService.ts`
- `ai/application/use-cases/ContextExpansionUseCase.ts` → `ai/chat/ContextExpansionUseCase.ts`
- `ai/application/use-cases/HelperProjectUseCase.ts` → `ai/chat/HelperProjectUseCase.ts`
- `ai/application/use-cases/HelperWorkspaceUseCase.ts` → `ai/chat/HelperWorkspaceUseCase.ts`
- `ai/application/use-cases/*Summary*.ts` → `ai/summary/*.ts`
- `ai/application/use-cases/ImageRequestUseCase.ts` → `ai/image/ImageRequestUseCase.ts`
- `ai/application/use-cases/VideoRequestUseCase.ts` → `ai/video/VideoRequestUseCase.ts`
- `ai/application/services/chatStream/streamOrchestrator.ts` → `ai/chat/streamOrchestrator.ts`
- `ai/application/services/chatStream/metadataBuilder.ts` → `ai/chat/metadataBuilder.ts`
- `ai/application/services/chatStream/messageOptionResolver.ts` → `ai/chat/messageOptionResolver.ts`
- `ai/application/services/summary/summaryGenerator.ts` → `ai/summary/summaryGenerator.ts`
- `ai/application/services/summary/summaryScheduler.ts` → `ai/summary/summaryScheduler.ts`
- `ai/application/services/ToolsetAssembler.ts` → `ai/tools/ToolsetAssembler.ts`
- `ai/application/services/ModelSelectionService.ts` → `ai/models/ModelSelectionService.ts`
- `ai/domain/services/CommandParser.ts` → `ai/tools/CommandParser.ts`
- `ai/domain/services/SkillSelector.ts` → `ai/tools/SkillSelector.ts`
- `ai/domain/services/MessageChainBuilder.ts` → `ai/shared/MessageChainBuilder.ts`
- `ai/domain/services/promptBuilder.ts` → `ai/shared/promptBuilder.ts`
- `ai/domain/services/prefaceBuilder.ts` → `ai/shared/prefaceBuilder.ts`
- `ai/domain/entities/*` → `ai/shared/types.ts`
- `ai/domain/value-objects/*` → `ai/shared/types.ts`
- `ai/infrastructure/adapters/AgentRunnerAdapter.ts` → `ai/agents/AgentRunnerAdapter.ts`
- `ai/infrastructure/adapters/ModelRegistryAdapter.ts` → `ai/models/ModelRegistryAdapter.ts`
- `ai/infrastructure/adapters/ProviderAdapterRegistry.ts` → `ai/models/ProviderAdapterRegistry.ts`
- `ai/infrastructure/adapters/ToolRegistryAdapter.ts` → `ai/tools/ToolRegistryAdapter.ts`
- `ai/infrastructure/adapters/AttachmentResolverAdapter.ts` → `ai/image/AttachmentResolverAdapter.ts`
- `ai/infrastructure/adapters/AiLoggerAdapter.ts` → `ai/shared/logging/AiLoggerAdapter.ts`
- `ai/infrastructure/adapters/SchedulerAdapters.ts` → `ai/summary/SchedulerAdapters.ts`
- `ai/infrastructure/adapters/imageEditNormalizer.ts` → `ai/image/imageEditNormalizer.ts`
- `ai/infrastructure/adapters/imageStorage.ts` → `ai/image/imageStorage.ts`
- `ai/infrastructure/repositories/messageStore.ts` → `ai/chat/repositories/messageStore.ts`
- `ai/infrastructure/repositories/messageChainLoader.ts` → `ai/chat/repositories/messageChainLoader.ts`
- `ai/infrastructure/repositories/PrismaMessageRepository.ts` → `ai/chat/repositories/PrismaMessageRepository.ts`
- `ai/infrastructure/repositories/PrismaSessionRepository.ts` → `ai/chat/repositories/PrismaSessionRepository.ts`
- `ai/infrastructure/repositories/PrismaJobRepository.ts` → `ai/summary/repositories/PrismaJobRepository.ts`
- `ai/infrastructure/repositories/PrismaTaskStatusRepository.ts` → `ai/summary/repositories/PrismaTaskStatusRepository.ts`
- `ai/infrastructure/repositories/InMemoryTaskStatusRepository.ts` → `ai/summary/repositories/InMemoryTaskStatusRepository.ts`
- `ai/infrastructure/gateways/AuthSessionGateway.ts` → `ai/chat/gateways/AuthSessionGateway.ts`
- `ai/infrastructure/gateways/SettingsGateway.ts` → `ai/chat/gateways/SettingsGateway.ts`
- `ai/infrastructure/gateways/VfsGatewayImpl.ts` → `ai/chat/gateways/VfsGatewayImpl.ts`
- `ai/application/ports/AuthGateway.ts` → `ai/chat/AuthGateway.ts`
- `ai/application/ports/MessageRepository.ts` → `ai/chat/MessageRepository.ts`
- `ai/application/ports/SessionRepository.ts` → `ai/chat/SessionRepository.ts`
- `ai/application/ports/SettingsRepository.ts` → `ai/chat/SettingsRepository.ts`
- `ai/application/ports/VfsGateway.ts` → `ai/chat/VfsGateway.ts`
- `ai/application/ports/SchedulerPort.ts` → `ai/summary/SchedulerPort.ts`
- `ai/application/ports/TaskStatusRepository.ts` → `ai/summary/TaskStatusRepository.ts`
- `ai/application/ports/AttachmentResolverPort.ts` → `ai/image/AttachmentResolverPort.ts`
- `ai/application/ports/ToolRegistryPort.ts` → `ai/tools/ToolRegistryPort.ts`
- `ai/application/ports/ModelRegistryPort.ts` → `ai/models/ModelRegistryPort.ts`
- `ai/application/ports/AgentRunnerPort.ts` → `ai/agents/AgentRunnerPort.ts`
- `ai/registry/toolRegistry.ts` → `ai/tools/toolRegistry.ts`
- `ai/registry/policies.ts` → `ai/tools/policies.ts`
- `ai/resolveChatModel.ts` → `ai/models/resolveChatModel.ts`
- `ai/resolveImageModel.ts` → `ai/models/resolveImageModel.ts`

### 7.3 删除/合并

- 删除：`ai/composition/AiModule.ts`（职责由 `bootstrap.ts` 吸收）。
- 移动：`resolveChatModel.ts` → `models/resolveChatModel.ts`（保留 `chat/modelResolution.ts`）。
- 合并：`application/services/chatStream/imagePrompt.ts` → `image/imagePrompt.ts`。

## 8. 风险与回归关注

- SSE 分段与 metadata 合并逻辑不能变。
- message chain 构建与 compact_summary 截断规则不能变。
- tool 审批、preface hash 去重、技能顺序保持一致。
- 迁移先保证 re-export 完整，再做 import 收敛。
