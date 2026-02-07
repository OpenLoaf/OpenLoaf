# 全栈开发模式

## Adding a New Tool (5-Step Full-Stack)

### Step 1: 定义 ToolDef（共享类型）

```typescript
// packages/api/src/types/tools/myTool.ts
import { z } from "zod";

export const myToolDef = {
  id: "my_tool",
  description: "描述工具用途，模型据此决定是否调用",
  parameters: z.object({
    query: z.string().describe("查询内容"),
  }),
} as const;
```

### Step 2: 实现工具逻辑

```typescript
// apps/server/src/ai/tools/myTool.ts
import { tool, zodSchema } from "ai";
import { myToolDef } from "@tenas-ai/api/types/tools/myTool";

export const myTool = tool({
  description: myToolDef.description,
  inputSchema: zodSchema(myToolDef.parameters),
  execute: async ({ query }) => {
    return { ok: true, data: { result: "..." } };
  },
});
```

### Step 3: 注册到 toolRegistry

```typescript
// apps/server/src/ai/tools/toolRegistry.ts
import { myTool } from "@/ai/tools/myTool";
import { myToolDef } from "@tenas-ai/api/types/tools/myTool";

const TOOL_REGISTRY = {
  // ...existing
  [myToolDef.id]: { tool: myTool },
};
```

### Step 4: 添加到 Agent 工具集

```typescript
// apps/server/src/ai/agents/masterAgent/masterAgent.ts
const MASTER_AGENT_TOOL_IDS = [
  // ...existing
  myToolDef.id,
] as const;
```

### Step 5: 前端渲染（可选）

大部分工具自动使用 `UnifiedTool` 通用卡片。如需自定义渲染，在 `message/tools/MessageTool.tsx` 添加路由分支。

## Adding a New Sub-Agent

### Step 1: 在 API 类型中注册名称

```typescript
// packages/api/src/types/tools/subAgent.ts
export const mySubAgentName = "MySubAgent";
// 并添加到 subAgentToolDef.parameters.name 的 z.enum 中
```

### Step 2: 创建子代理定义

```typescript
// apps/server/src/ai/agents/subagent/mySubAgent.ts
import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { buildToolset } from "@/ai/tools/toolRegistry";
import { createToolCallRepair } from "@/ai/agents/repairToolCall";
import MY_PROMPT from "./mySubAgent.zh.md";

export const MY_SUB_AGENT_NAME = "MySubAgent";
const MY_SUB_AGENT_TOOL_IDS = [/* 只暴露必要工具 */] as const;

export function createMySubAgent(input: { model: LanguageModelV3 }) {
  return new ToolLoopAgent({
    id: "my-sub-agent",
    model: input.model,
    instructions: MY_PROMPT.trim(),
    tools: buildToolset(MY_SUB_AGENT_TOOL_IDS),
    experimental_repairToolCall: createToolCallRepair(),
  });
}
```

### Step 3: 创建系统提示词

创建 `mySubAgent.zh.md`（Markdown 格式的 system prompt）。

### Step 4: 在 subAgentTool 中注册

在 `tools/subAgentTool.ts` 的名称白名单和 agent 创建分支中添加新子代理。

## Modifying Agent Prompt

| 修改目标 | 文件 |
|----------|------|
| Master Agent 基础角色 | `agents/masterAgent/masterAgentPrompt.zh.md` |
| 子代理提示词 | `agents/subagent/*.zh.md` |
| Session preface（运行时上下文） | `shared/prefaceBuilder.ts` → `buildSessionPrefaceText()` |
| 技能摘要格式 | `shared/promptBuilder.ts` → `buildSkillsSummarySection()` |

## Skills System

技能文件存放在 `.tenas/skills/<name>/SKILL.md`，由 `skillsLoader.ts` 扫描加载。

**加载优先级**: workspace → parent projects → current project（后者覆盖前者）

**使用流程**:
1. 用户消息中输入 `/skill/name`
2. `SkillSelector.extractSkillNamesFromText()` 解析名称
3. `AiExecuteService` 加载 SKILL.md 内容
4. 作为 `data-skill` part 注入到用户消息前
5. `messageConverter.ts` 中 `convertDataPart` 转为模型可读文本（`<skill>` 标签包裹）

## Backend-Driven Frontend Actions（前端执行工具）

某些工具需要在前端执行操作（如打开浏览器面板），后端阻塞等待前端回执后继续 AI 循环。以 `open-url` 为典型案例。

### 架构流程

```
AI Agent 调用工具
    ↓
后端 tool.execute()
    → registerFrontendToolPending(toolCallId, timeoutSec)  ← 创建 Promise 阻塞
    ↓ (工具调用流式推送到前端)
前端 FrontendToolExecutor
    → executeFromDataPart/executeFromToolPart
    → handler 执行前端操作（如 pushStackItem 打开浏览器面板）
    → postFrontendToolAck({ toolCallId, status, output })  ← POST /ai/tools/ack
    ↓
后端 frontendToolAckRoutes
    → resolveFrontendToolPending(payload)  ← Promise resolve
    ↓
后端工具返回结果，AI 循环继续
```

### 案例：open-url 工具

**1. 共享类型定义**

```typescript
// packages/api/src/types/tools/browser.ts
export const openUrlToolDef = {
  id: "open-url",
  parameters: z.object({
    actionName: z.string().min(1),
    url: z.string(),
    title: z.string().optional(),
    timeoutSec: z.number().int().positive().optional(),
  }),
}
```

**2. 后端工具**（阻塞等待前端回执）

```typescript
// apps/server/src/ai/tools/openUrl.ts
export const openUrlTool = tool({
  execute: async (input, options) => {
    requireTabId()  // 前端执行工具必须有 tabId
    const result = await registerFrontendToolPending({
      toolCallId: options.toolCallId,
      timeoutSec: normalizeTimeoutSec(input.timeoutSec),
    })
    // result.status: "success" | "timeout" | "failed"
    return result
  },
})
```

**3. 前端执行器**（自动执行 + 回执）

```typescript
// apps/web/src/lib/chat/frontend-tool-executor.ts
// 创建执行器并注册 handler
const executor = createFrontendToolExecutor()
registerDefaultFrontendToolHandlers(executor)

// open-url handler 核心逻辑：
executor.register("open-url", async ({ input, tabId }) => {
  const url = normalizeUrl(input.url)
  // 前端操作：推入浏览器面板到 Tab Stack
  useTabRuntime.getState().pushStackItem(tabId, {
    component: BROWSER_WINDOW_COMPONENT,
    params: { __open: { url, title, viewKey } },
  })
  // Electron 环境等待页面加载完成
  if (window.tenasElectron) {
    await waitForWebContentsViewReady(viewKey)
  }
  return { status: "success", output: { url, viewKey } }
})
// handler 返回后，executor 自动 POST /ai/tools/ack
```

**4. 前端工具卡片**（消息中的可点击 UI）

```typescript
// apps/web/src/components/chat/message/tools/OpenUrlTool.tsx
// UnifiedTool 中路由：toolKind === "open-url" → <OpenUrlTool />
// 渲染为可点击链接，用户点击也可手动打开浏览器面板
```

### PendingRegistry 核心机制

```typescript
// apps/server/src/ai/tools/pendingRegistry.ts
registerFrontendToolPending({ toolCallId, timeoutSec })
  → 返回 Promise，超时自动 resolve 为 { status: "timeout" }
  → 每个 toolCallId 只能注册一次

resolveFrontendToolPending(payload)
  → 找到 pending → resolve Promise → 返回 "resolved"
  → 未找到 → 存为 early ack（30s TTL）→ 返回 "stored"
  → early ack 解决前端回执先于后端注册的时序问题
```

### 添加新的前端执行工具

在现有 5 步基础上额外需要：

1. 后端 `execute` 中使用 `registerFrontendToolPending()` 替代直接返回
2. 后端必须调用 `requireTabId()` 确保有 tabId
3. 在 `frontend-tool-executor.ts` 的 `registerDefaultFrontendToolHandlers()` 中注册 handler
4. handler 执行前端操作后返回 `{ status, output, errorText? }`
5. 每个 toolCallId 自动去重（`executed` Set），不会重复执行

### 当前使用此模式的工具

| 工具 | 用途 | 文件 |
|------|------|------|
| `open-url` | 在应用内打开网页浏览器面板 | `tools/openUrl.ts` |
| `sub-agent` (approval) | 子代理审批等待用户确认 | `tools/subAgentTool.ts` |

### Key Files

```
apps/server/src/ai/tools/pendingRegistry.ts      ← Promise 注册/回执/超时
apps/server/src/ai/tools/openUrl.ts               ← open-url 后端实现
apps/server/src/ai/interface/routes/frontendToolAckRoutes.ts  ← POST /ai/tools/ack
apps/web/src/lib/chat/frontend-tool-executor.ts   ← 前端执行器 + handler 注册
apps/web/src/components/chat/message/tools/OpenUrlTool.tsx    ← 前端工具卡片
```

## Debugging Tips

### 前端
1. **消息检查**: `useChatState().messages` 查看完整消息数组
2. **分支调试**: `useChatSession().siblingNav` 查看兄弟关系
3. **工具流式**: `useChatTools().toolParts` 查看实时工具快照
4. **子代理**: `useChatTools().subAgentStreams` 查看子代理输出
5. **SSE 调试**: 浏览器 Network 面板查看 EventSource 流

### 后端
1. **请求追踪**: `logger` 自动附带 sessionId
2. **工具修复日志**: 搜索 `[tool-repair]` 判断 JSON 修复
3. **消息链**: `resolveMessagePathById` 重建消息链
4. **模型解析**: `resolveChatModel()` 返回 null → 检查 API key 配置
5. **上下文检查**: `getRequestContext()` 返回 undefined → 不在 SSE 上下文中
