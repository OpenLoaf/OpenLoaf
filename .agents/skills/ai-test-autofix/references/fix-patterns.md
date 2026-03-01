# Fix Patterns — AI Agent 行为测试修复代码模式

本文档提供具体的代码修复模式和 before/after 示例，供 `/ai-test-autofix` 命令在诊断和修复失败用例时参考。

---

## 1. 工具描述修复模式

**文件位置**：`packages/api/src/types/tools/*.ts`

工具描述是 LLM 判断是否调用该工具的核心依据。description 字段应遵循以下结构：

```
"触发：<何时调用>。用途：<具体做什么>。返回：<返回值格式>。不适用：<何时不要用>。"
```

### Before/After 示例

**问题**：Agent 查询项目时使用了 `list-dir` 而非 `project-query`，因为 `project-query` 的描述没有明确和用户常用说法的对应。

**Before**（`packages/api/src/types/tools/db.ts`）：
```typescript
export const projectQueryToolDef = {
  id: "project-query",
  description:
    "触发：当你需要读取项目列表/树或某个项目摘要信息时调用。用途：list 返回项目树与扁平列表，get 返回项目摘要。返回：...",
  // ...
}
```

**After**：
```typescript
export const projectQueryToolDef = {
  id: "project-query",
  description:
    "触发：当用户询问"有哪些项目"、"项目列表"、"我的项目"等应用层项目信息时调用，而非文件系统目录。用途：list 返回项目树与扁平列表，get 返回项目摘要。返回：...",
  // ...
}
```

**关键点**：
- 在"触发"部分添加用户常见的自然语言说法
- 在"不适用"部分明确区分容易混淆的工具
- 不要改变返回值格式等其他部分

### 常见描述增强模式

| 混淆对 | 增强方向 |
|--------|---------|
| `project-query` vs `list-dir` | project-query 强调"应用层项目"，list-dir 强调"文件系统目录" |
| `email-query` vs `shell-command` | email-query 强调"邮件/收件箱/邮件列表" |
| `read-file` vs `shell-command` | read-file 强调"读取文件内容"，shell-command 不适合读文件 |
| `task-manage` vs 不调工具 | task-manage 强调"创建任务/提醒/待办" |

---

## 2. Prompt 修复模式

**文件位置**：`apps/server/src/ai/agent-templates/templates/master/prompt.zh.md`

### prompt.zh.md 结构说明

```markdown
你是 OpenLoaf AI 助手...

<behavior>
# 沟通
...
</behavior>

<tools>
# 工具使用

## 核心原则
...

## 选择策略          ← 最常修改的位置
...

## 审批
...

## 返回值处理
...

## 异常处理
...

## 媒体生成（image-generate / video-generate）
...

## 交互式组件（jsx-create / request-user-input）
...
</tools>

<execution>
...
</execution>

<delegation>
...
</delegation>

<task-creation>
...
</task-creation>

<planning>
...
</planning>

<output>
...
</output>

<skills>
...
</skills>
```

### 修改位置选择

| 修复目标 | 添加位置 |
|----------|---------|
| 工具选择规则（A 而非 B） | `<tools>` → `## 选择策略` 下方 |
| 输出格式/内容要求 | `<output>` 部分 |
| 特定工具的使用细则 | `<tools>` → 对应工具的 `##` 小节 |
| 全局行为变化 | `<behavior>` 部分 |

### Before/After 示例

**问题**：Agent 被问"有哪些项目"时使用了 `list-dir` 而非 `project-query`。

**Before**（`<tools>` 的 `## 选择策略` 末尾）：
```markdown
## 选择策略
- 最小权限：只读优先 → 写入 → 破坏性操作。
- ...
- Shell 工具中，搜索文本/文件优先使用 `rg`。
```

**After**：
```markdown
## 选择策略
- 最小权限：只读优先 → 写入 → 破坏性操作。
- ...
- Shell 工具中，搜索文本/文件优先使用 `rg`。
- 用户提及"项目"（项目列表、有哪些项目、我的项目）时使用 `project-query`，不要用 `list-dir`。`list-dir` 仅用于文件系统目录浏览。
```

**关键点**：
- 在 `## 选择策略` 末尾追加一行规则
- 使用简洁的"X 时用 A，不要用 B"格式
- 包含用户可能使用的自然语言说法

### 添加工具禁止规则

**问题**：Agent 查询时间时使用了 `shell-command`（运行 `date`）而非 `time-now`。

**添加到 `## 选择策略`**：
```markdown
- 查询当前时间/日期使用 `time-now`，不要用 `shell-command` 运行 date 命令。
```

### 添加工具使用鼓励

**问题**：Agent 没有调用任何工具，直接文本回复。

**添加到 `## 核心原则`**：
```markdown
- 当用户请求涉及数据查询、文件操作、系统信息等可用工具覆盖的能力时，必须调用工具获取实际数据，不得凭记忆或猜测回答。
```

---

## 3. 工具别名修复模式

**文件位置**：`apps/server/src/ai/tools/toolRegistry.ts`

### TOOL_ALIASES 格式

```typescript
const TOOL_ALIASES: Record<string, string> = {
  shell: "shell-command",
  exec: "shell-command",
  run: "shell-command",
  "write-file": "apply-patch",
  "edit-file": "apply-patch",
  search: "grep-files",
  find: "grep-files",
  "create-task": "task-manage",
};
```

### 添加新别名

**问题**：LLM 试图调用不存在的工具名 `query-projects`（而实际工具名是 `project-query`）。

**修复**：在 TOOL_ALIASES 中添加映射：
```typescript
const TOOL_ALIASES: Record<string, string> = {
  // ... 现有别名
  "query-projects": "project-query",
  "query-project": "project-query",
};
```

**判断依据**：
- 检查失败用例中 `metadata.toolCalls` 是否有调用了不存在工具的记录
- 或在 Agent 输出文本中搜索 "tool not found" 相关提示
- 别名应该只映射 LLM 可能猜测的合理名称变体

---

## 4. Master toolIds 修复模式

**文件位置**：`apps/server/src/ai/agent-templates/templates/master/index.ts`

### toolIds 列表结构

```typescript
export const masterTemplate: AgentTemplate = {
  id: 'master',
  toolIds: [
    // system
    'time-now',
    'update-plan',
    'jsx-create',
    // agent
    'spawn-agent',
    'send-input',
    'wait-agent',
    'abort-agent',
    // file-read
    'read-file',
    'list-dir',
    'grep-files',
    // file-write
    'apply-patch',
    // shell
    'shell-command',
    // web
    'open-url',
    // ... 其他工具
  ],
  // ...
}
```

### 添加缺失的工具

**问题**：测试期望 Agent 调用 `email-query`，但 Master 的 toolIds 中没有这个工具（说明测试预期 Agent 可以直接查邮件）。

**修复**：在合适的分类注释下添加工具 ID：
```typescript
toolIds: [
  // ... 现有工具
  // email（新增）
  'email-query',
],
```

**注意**：
- 添加前先确认工具确实注册在 `TOOL_REGISTRY` 中
- 按分类注释放在合适位置
- 不要删除现有的 toolIds

### 何时修改 toolIds vs 何时不修改

| 场景 | 行动 |
|------|------|
| 测试期望的工具不在 toolIds 中 | 添加到 toolIds |
| 工具在 toolIds 中但 Agent 没调用 | 修改 prompt 或工具描述，不动 toolIds |
| Agent 调了不该调的工具 | 修改 prompt 添加禁止规则，不从 toolIds 移除 |

---

## 5. 多轮对话失败的特殊处理

多轮对话用例（`vars.turns` 存在）的失败通常不是工具选择问题，而是上下文保持问题。

### 诊断方式

1. 检查 `metadata.toolNames` — 第一轮调用的工具是否正确
2. 检查 `response.output` — 最后一轮回复是否引用了之前的信息
3. 通常是 LLM 能力问题，而非代码可修复的问题

### 修复策略

多轮对话失败优先检查：
1. E2E Provider 的 sessionId 是否在同一组 turns 中保持不变（应该是的）
2. 如果是第一轮就失败，按普通单轮用例处理
3. 如果第一轮成功但后续轮次失败，通常标记为**需要人工评估**

---

## 6. 验证技巧

### 使用 --filter-description 精确重跑

```bash
# 单个用例
cd scripts/docker-e2e && docker compose run --rm behavior-test pnpm run test:ai:behavior --keep-output --filter-description "e2e-001"

# 多个用例（正则匹配）
cd scripts/docker-e2e && docker compose run --rm behavior-test pnpm run test:ai:behavior --keep-output --filter-description "e2e-00[1-3]"

# 包含关键词
cd scripts/docker-e2e && docker compose run --rm behavior-test pnpm run test:ai:behavior --keep-output --filter-description "project"
```

### 使用 --repeat 测试稳定性

修复后建议用 `--repeat 2` 验证稳定性（LLM 有非确定性）：

```bash
cd scripts/docker-e2e && docker compose run --rm behavior-test pnpm run test:ai:behavior --keep-output --filter-description "e2e-001" --repeat 2
```

如果 2 次中有 1 次失败，说明修复还不够稳定，需要进一步加强。

### 快速验证单个修复

```bash
# 1. 修改代码后
# 2. 只跑目标用例（Docker volume 挂载了整个项目，代码改动立即生效）
cd scripts/docker-e2e && docker compose run --rm behavior-test pnpm run test:ai:behavior --keep-output --filter-description "e2e-001"
# 3. 读取输出确认（输出文件在宿主机可直接读取）
cat apps/server/.behavior-test-output.json | jq '.results.results[0].success'
```

---

## 7. 修复顺序建议

当一轮中有多个失败用例时，按以下顺序修复：

1. **NO_TOOL** — 最可能是 toolIds 缺失，一行修复
2. **WRONG_TOOL** — 工具描述或 prompt 选择策略问题
3. **FORBIDDEN_TOOL** — prompt 添加禁止规则
4. **OUTPUT_QUALITY** — prompt 调整输出要求（最不确定，放最后）

如果多个用例的失败根因相同（如都因为 prompt 缺少某条规则），一次修复可以解决多个。

---

## 8. prompt.en.md 同步

当修改了 `prompt.zh.md` 后，如果项目中存在 `prompt.en.md`，应当同步修改。

同步原则：
- 规则语义保持一致
- 工具名保持不变（英文）
- 用户说法的示例翻译为英文等价表达
