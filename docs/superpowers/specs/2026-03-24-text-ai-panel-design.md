# Text AI 面板 + Skill 插槽 + Board Agent — 设计方案

> 日期：2026-03-24
> 状态：Draft
> 范围：前端 TextAiPanel 重构 + 后端 Board Agent + StoryboardNode 新节点

---

## 一、背景与动机

当前 OpenLoaf 画布的 AI 能力集中在图片/视频/音频（SaaS v3 路径），文字处理仅有一个空壳 TextAiPanel（`handleTextAiGenerate` 未实现）。缺失的能力：

- 文字润色/改写、翻译、提示词优化
- 图片理解、视频理解（跨模态→文字）
- Skill 作为可组合的 prompt 模板嵌入画布
- 分镜生成等结构化文字输出
- Agent 驱动的多步画布操作

---

## 二、核心架构决策

### 文本 vs 媒体：两条独立的技术路径

| | Image/Video/Audio 面板 | Text AI 面板 |
|---|---|---|
| API 路径 | SaaS v3 generate → poll task | **Board Agent → chat model → streamText** |
| 计费 | SaaS credits | 用户自带模型 key |
| Feature 来源 | `useCapabilities(category)` 从 SaaS 拉取 | **本地注册表**（不依赖 SaaS） |
| 模型 | SaaS 固定 | 用户 chat 模型列表（按能力 tag 过滤） |
| Skill | 不适用 | 作为 system prompt 注入 |
| 结果 | 文件 URL（asset） | 文本内容 / 结构化数据 |

### Board Agent（专用 Agent）

不复用 Master Agent。Board Agent 是专用的画布任务执行者：

- **无会话**：每次独立任务，不维护聊天历史
- **画布工具集**：`board-query`、`board-create-node`、`board-derive-node`、`board-update-node`、`board-batch-derive`、`read-file`
- **轻量**：maxSteps=10，maxDepth=0（不 spawn 子 agent）
- **预加载 Skill**：Skill 内容在创建时注入 system prompt，非运行时 loadSkill

---

## 三、Text Feature 注册表

Feature 定义结构：

```typescript
interface TextFeatureDefinition {
  id: string
  label: string                          // i18n key
  icon: string                           // lucide icon name
  isApplicable: (upstream: UpstreamData) => boolean
  requiredModelTags?: ModelTag[]         // 对模型的能力要求
  systemPrompt: string                   // 默认 system prompt（无 Skill 时兜底）
  placeholder?: string
  supportsSkill?: boolean                // 是否支持加载 Skill
  outputMode: 'replace' | 'derive' | 'fan-out'
  parseOutput?: (text: string) => string[]  // fan-out 拆分器
}
```

### Feature 列表

#### 纯文字处理（text → text）

| ID | 名称 | 触发条件 | outputMode | Skill |
|---|---|---|---|---|
| `textGenerate` | 文本生成 | 始终可用（默认） | replace | ✅ |
| `textPolish` | 文本润色 | 有上游文字 | derive | ✅ |
| `textTranslate` | 文本翻译 | 有上游文字 | derive | ✅ |
| `promptEnhance` | 提示词优化 | 有上游文字 | replace | ✅ |

#### 跨模态 → 文字

| ID | 名称 | 触发条件 | 模型要求 | outputMode | Skill |
|---|---|---|---|---|---|
| `imageUnderstand` | 图片理解 | 有上游图片 | `image_input` | derive | ✅ |
| `videoUnderstand` | 视频理解 | 有上游视频 | `video_analysis` | derive | ✅ |
| `audioTranscribe` | 音频转文字 | 有上游音频 | `audio_analysis` | derive | ❌ |
| `fileToText` | 文件转文字 | 有上游文件 | 无（本地解析） | derive | ❌ |

> 跨模态 feature 统一用 `derive`（生成新文本节点），因为上游是媒体节点，不应被 replace。

#### 结构化输出

| ID | 名称 | outputMode | 输出节点 |
|---|---|---|---|
| `storyboard` | 分镜生成 | fan-out | **StoryboardNode** |

### Feature Tab 显示规则

由各 Feature 的 `isApplicable(upstream)` 统一控制，不额外维护规则表。

---

## 四、Skill 插槽机制

### 在面板中的位置

```
┌─ TextAiPanel ─────────────────────────────────┐
│  [Feature Tabs] 润色 | 翻译 | 图片理解 | ...  │
│  ┌─ Upstream Preview ──────────────────────┐  │
│  │ 上游内容预览（渐变淡出）                 │  │
│  └─────────────────────────────────────────┘  │
│  ┌─ Skill Slot ────────────────────────────┐  │
│  │ 📎 分镜生成 ×  |  📎 动漫风格 ×  | [+]  │  │
│  └─────────────────────────────────────────┘  │
│  ┌─ Instruction ───────────────────────────┐  │
│  │ 用户指令输入                             │  │
│  └─────────────────────────────────────────┘  │
│  [Model ▼]                    [═══ 生成 ═══]  │
└───────────────────────────────────────────────┘
```

### Skill 元数据扩展

SKILL.md front matter 新增可选字段 `textFeatures`：

```yaml
---
name: storyboard-generator
description: 将创意描述转化为专业分镜脚本
textFeatures: [textGenerate, storyboard]
---
```

不加 `textFeatures` 的 Skill 默认对所有 feature 可用（向后兼容）。

### Prompt 组装规则

```
最终 system prompt = Skill 内容（如有） || Feature 默认 prompt
最终 user prompt = <input>上游内容</input> + 用户指令
```

- 有 Skill 时，Skill **替代** feature 默认 prompt（Skill 本身是完整角色定义）
- 多个 Skill 用 `<skill name="...">` 标签包裹，最多 3 个，按添加顺序排列（先加的在前）
- 上游内容用 `<input>` 标签包裹

---

## 五、Board Agent

### 调用入口

```
POST /ai/board-agent
```

### 请求结构

```typescript
interface BoardAgentRequest {
  boardId: string
  projectId: string
  sourceNodeId: string

  featureId: string
  skillContents: { name: string; content: string }[]

  instruction: string
  upstreamText?: string
  upstreamImages?: string[]
  upstreamVideoUrl?: string
  upstreamAudioUrl?: string

  chatModelId: string
  chatModelSource: ChatModelSource
  outputMode: 'replace' | 'derive' | 'fan-out'
}
```

### Agent 配置

```typescript
{
  type: 'board',
  tools: BOARD_AGENT_TOOLS,
  maxSteps: 10,
  maxDepth: 0,          // 不 spawn 子 agent
  sessionId: undefined, // 无会话
}
```

### System Prompt 组装

1. Agent 角色定义 + 画布上下文（sourceNodeId、outputMode）
2. Skills（`<skill>` 标签包裹）或 Feature 默认 prompt
3. outputMode 指令：replace → `board-update-node`，derive → `board-derive-node`，fan-out → `board-create-node(type:'storyboard')`

### 行为模式

| 任务类型 | 示例 | Agent 行为 |
|---|---|---|
| 简单 | 润色、翻译 | 生成文本 → `board-update-node` 或 `board-derive-node` |
| 结构化 | 分镜生成 | 生成 JSON → `board-create-node(type:'storyboard')` |
| 复杂链式（Phase 2） | 分镜→批量生图 | 创建分镜节点 → 对每个 shot 调用 `media-generate` |

### 后端架构位置

- **路由层**：Hono HTTP 路由 `POST /ai/board-agent`，注册在 `apps/server/src/ai/interface/routes/aiBoardAgentRoutes.ts`（新文件）
- **与 canvas-designer 的关系**：`canvas-designer` 是 Master Agent 的子 agent（对话式），Board Agent 是独立的任务式 agent（从画布面板触发）。两者共享画布工具集但入口不同
- **复用基础设施**：复用 `ToolLoopAgent`（Vercel AI SDK agent loop）、`resolveChatModel`、画布工具注册表
- **鉴权**：复用现有 Hono 中间件（Bearer token / local-auth），与 `/ai/copilot` 同级

### 前端响应机制

- **简单任务**（润色/翻译）：SSE 流式返回文本，前端实时预览，完成后用户点"应用"写入节点
- **结构化任务**（分镜）：SSE 流式返回 JSON，前端解析后展示预览，完成后用户点"应用"创建节点
- **超时**：默认 60s，前端提供取消按钮（abort SSE 连接）
- **错误处理**：Agent 执行失败时返回 `{ error, partial? }` ，面板显示错误信息

### 前端 UI

生成过程中面板只显示最终 step 内容（分镜列表、润色结果），不展示 Agent 的 reasoning 和 tool calls。

---

## 六、StoryboardNode（分镜节点）

### 数据结构

```typescript
interface StoryboardShot {
  id: string
  index: number
  scene: string          // 画面描述（核心）
  dialogue?: string
  duration?: number
  camera?: string
  derivedNodeId?: string
}

interface StoryboardNodeProps {
  title?: string
  shots: StoryboardShot[]
}
```

### 视觉表现

紧凑列表，每行显示 scene + duration，每行右侧有独立输出端口：

```
┌─ 🎬 猫咪打架 ───────────────────────── [⋯] ─┐
│  1  两只猫在纸箱旁对峙，竖起尾巴      3s  →○ │
│  2  橘猫试探性伸出爪子                2s  →○ │
│  3  黑猫一巴掌拍回                    2s  →○ │
│  4  两猫扭打，纸箱被撞翻              4s  →○ │
│  5  两猫并排趴在纸箱里                3s  →○ │
│  [+ 添加镜头]                                │
└──────────────────────────────────────────────┘
```

- 双击某行展开编辑（scene、dialogue、duration、camera）
- 每个 shot 的 `→○` 可独立连线到下游 Image/Video 节点
- 下游节点自动获取该 shot 的 `scene` 作为 prompt 上游

### 分镜节点的 AI 面板

支持对整个分镜进行操作（优化所有镜头、批量生图等），具体交互后续完善。

---

## 七、模型选择

模型列表来自两个数据源：

1. **Cloud 模型**（`useCloudModels`）— 需要 SaaS 登录，有完整的 `tags` 能力标记
2. **本地 Provider 模型**（`useProviderModels`）— 用户自配 API key，可能缺少 `tags`

按 Feature 的 `requiredModelTags` 过滤：

- `imageUnderstand` → 仅显示有 `image_input` tag 的模型
- `videoUnderstand` → 仅显示有 `video_analysis` tag 的模型
- `audioTranscribe` → 仅显示有 `audio_analysis` tag 的模型
- 其他 → 显示所有模型

> 本地 Provider 模型如无 tags 字段，默认不参与能力过滤（即对无 `requiredModelTags` 的 feature 始终显示）。纯本地模式下跨模态 feature 可能无可用模型，面板应提示"需要配置支持该能力的模型"。

---

## 八、分阶段实施

| Phase | 内容 | 依赖 |
|---|---|---|
| **Phase 1** | TextAiPanel 重构（Feature tabs + Skill 插槽 + 模型选择器）+ Board Agent 后端 + 基础 features（textGenerate/textPolish/textTranslate/promptEnhance） | 无 |
| **Phase 2** | 跨模态 features（imageUnderstand/videoUnderstand/audioTranscribe/fileToText） | Phase 1 |
| **Phase 3a** | StoryboardNode 节点本体（数据结构、渲染、编辑） + `BOARD_NODE_DEFINITIONS` / `DeriveTargetType` 注册 | Phase 1 |
| **Phase 3b** | Shot 级输出端口（画布引擎扩展，支持 shot→下游连线） | Phase 3a |
| **Phase 4** | 复杂链式（分镜→批量生图/生视频）+ `media-generate` 工具。注意：此阶段 Board Agent 需跨越免费和 SaaS 两条路径，需明确计费授权策略 | Phase 2 + 3b |

---

## 九、Skill 系统改动范围

新增 `textFeatures` 字段涉及的文件：

| 文件 | 改动 |
|------|------|
| `apps/server/src/ai/services/skillsLoader.ts` | `SkillFrontMatter` 类型 + `parseFrontMatter` 解析 |
| `packages/api/src/types/tools/skill.ts` | `SkillSummary` 类型新增 `textFeatures` 字段 |
| `apps/web/src/components/board/panels/TextAiPanel.tsx` | Skill 选择器 UI + 按 `textFeatures` 过滤 |
| `apps/server/src/routers/settings.ts` | `getSkills` 返回值包含新字段 |
