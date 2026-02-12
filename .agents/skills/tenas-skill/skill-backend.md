# Skill Backend

## 核心模块

### 1. skillsLoader.ts — 扫描加载器

**路径**: `apps/server/src/ai/agents/masterAgent/skillsLoader.ts`

#### 类型定义

```typescript
type SkillScope = "workspace" | "project" | "global";

type SkillSummary = {
  name: string;        // 技能名称（front matter 或文件夹名 fallback）
  description: string; // 技能描述（front matter，默认"未提供"）
  path: string;        // SKILL.md 绝对路径
  folderName: string;  // 技能文件夹名称
  scope: SkillScope;   // 技能作用域
};

type SkillSource = {
  scope: SkillScope;
  rootPath: string;    // 扫描根路径
};
```

#### 核心函数

**`loadSkillSummaries(input)`** — 主入口，扫描所有技能目录

```typescript
loadSkillSummaries({
  workspaceRootPath?: string;
  projectRootPath?: string;
  parentProjectRootPaths?: string[];
  globalSkillsPath?: string;        // ~/.agents/skills
}): SkillSummary[]
```

流程：
1. `resolveSkillSources()` 按优先级构建 source 列表（global → workspace → parent → project）
2. 对每个 source，拼接扫描路径：
   - `global` scope → 直接使用 `rootPath`（即 `~/.agents/skills`）
   - 其他 scope → `rootPath + .agents/skills/`
3. `findSkillFiles()` 递归查找所有 `SKILL.md`
4. `readSkillSummaryFromPath()` 解析每个文件的 front matter
5. 同名覆盖：`project` scope 总是覆盖；其他 scope 仅首次出现时写入

**`readSkillSummaryFromPath(filePath, scope)`** — 解析单个 SKILL.md

- 读取文件内容 → `parseFrontMatter()` 提取 name/description
- name fallback：`path.basename(path.dirname(filePath))`（文件夹名）
- description 规范化：多行合并为单行，默认"未提供"

**`readSkillContentFromPath(filePath)`** — 读取技能正文（剥离 front matter）

- `stripSkillFrontMatter()` 找到第二个 `---` 分隔符，返回之后的内容

**`parseFrontMatter(content)`** — YAML front matter 解析器

- 仅解析 `name` 和 `description` 两个字段
- 支持 YAML 块标量：`|`（literal）和 `>`（folded）
- 支持引号值自动剥离

### 2. SkillSelector.ts — AI 技能选择器

**路径**: `apps/server/src/ai/tools/SkillSelector.ts`

#### 类型定义

```typescript
type SkillScope = "project" | "parent" | "workspace" | "global";
// 注意：SkillSelector 多了 "parent" scope，用于区分父项目技能

type SkillMatch = {
  name: string;
  path: string;
  scope: SkillScope;
  content: string;     // 剥离 front matter 后的正文
};
```

#### 核心方法

**`SkillSelector.resolveSkillByName(name, roots)`** — 按优先级搜索技能

搜索顺序（从高到低）：project → parent → workspace → global

```typescript
const match = await SkillSelector.resolveSkillByName("chat-ai-development", {
  projectRoot: "/path/to/project",
  parentRoots: ["/path/to/parent"],
  workspaceRoot: "/path/to/workspace",
});
// match.content 包含剥离 front matter 后的完整正文
```

全局技能路径自动从 `homedir() + ".agents/skills"` 构建，无需外部传入。

**`SkillSelector.extractSkillNamesFromText(text)`** — 从文本提取技能引用

匹配 `/skill/<name>` 模式，返回去重有序的技能名列表。

### 3. settings.ts — tRPC 路由

**路径**: `apps/server/src/routers/settings.ts`

#### getSkills 查询

```typescript
trpc.settings.getSkills.query({ projectId?: string })
// 返回: SkillSummary[]（含 ignoreKey, isEnabled, isDeletable）
```

流程：
1. 获取 workspaceRootPath、projectRootPath、parentProjectRootPaths
2. 调用 `loadSkillSummaries()` 获取原始摘要（传入 `globalSkillsPath: resolveGlobalSkillsPath()`）
3. 为每个技能计算 ignoreKey、isEnabled、isDeletable

#### ignoreKey 规则

| Scope | ignoreKey 格式 | 示例 |
|-------|---------------|------|
| `global` | `global:<folderName>` | `global:my-skill` |
| `workspace` | `workspace:<folderName>` | `workspace:my-skill` |
| `project`（当前项目） | `<folderName>` | `my-skill` |
| `project`（父项目） | `<parentProjectId>:<folderName>` | `abc123:my-skill` |

#### isEnabled 判断

| 场景 | 判断逻辑 |
|------|----------|
| 工作空间视图 + global/workspace 技能 | `!workspaceIgnoreSkills.includes(ignoreKey)` |
| 项目视图 + 任意技能 | `!projectIgnoreSkills.includes(ignoreKey)` |

#### isDeletable 判断

| Scope | 工作空间视图 | 项目视图 |
|-------|-------------|---------|
| `global` | `false`（不可删除） | `false` |
| `workspace` | `true` | `false` |
| `project` | — | 仅当前项目的技能可删除 |

#### setSkillEnabled 变更

```typescript
trpc.settings.setSkillEnabled.mutate({
  scope: "workspace" | "project" | "global",
  projectId?: string,
  ignoreKey: string,
  enabled: boolean,
})
```

- `scope === "workspace"` 或 `"global"` → 更新工作空间配置的 `ignoreSkills`
- `scope === "project"` → 更新项目 `project.json` 的 `ignoreSkills`

#### deleteSkill 变更

```typescript
trpc.settings.deleteSkill.mutate({
  scope: "workspace" | "project" | "global",
  projectId?: string,
  ignoreKey: string,
  skillPath: string,
})
```

- `scope === "global"` → 直接拒绝（全局技能不可从设置面板删除）
- 删除前验证路径必须在 `.agents/skills/` 目录内
- 删除后清理对应的 ignoreSkills 条目

### 4. absSetting.ts — Zod Schema

**路径**: `packages/api/src/routers/absSetting.ts`

```typescript
const skillScopeSchema = z.enum(["workspace", "project", "global"]);

const skillSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string(),
  folderName: z.string(),
  ignoreKey: z.string(),
  scope: skillScopeSchema,
  isEnabled: z.boolean(),
  isDeletable: z.boolean(),
});
```

修改 scope 枚举时，需同步更新：
- `skillsLoader.ts` 的 `SkillScope` 类型
- `SkillSelector.ts` 的 `SkillScope` 类型
- `SkillsSettingsPanel.tsx` 的 `SkillScope` 类型和 `SCOPE_LABELS` / `SCOPE_TAG_CLASS`

## 启用/禁用持久化

### 工作空间级

存储位置：`~/.tenas/workspaces.json` → 活跃工作空间的 `ignoreSkills` 数组

```json
{
  "isActive": true,
  "ignoreSkills": ["workspace:my-skill", "global:another-skill"]
}
```

- `workspace:` 前缀的 key 控制工作空间技能
- `global:` 前缀的 key 控制全局技能
- `normalizeWorkspaceIgnoreKeys()` 兼容两种前缀

### 项目级

存储位置：`<project>/.tenas/project.json` → `ignoreSkills` 数组

```json
{
  "ignoreSkills": ["workspace:my-skill", "global:another-skill", "my-project-skill"]
}
```

- 项目级可以覆盖工作空间级和全局级的启用状态
- 工作空间级别关闭的技能不会出现在项目列表中

## 添加新 Scope 的检查清单

如需添加新的技能作用域（如 `team`）：

1. `packages/api/src/routers/absSetting.ts` — `skillScopeSchema` 添加枚举值
2. `apps/server/src/ai/agents/masterAgent/skillsLoader.ts` — `SkillScope` 类型、`resolveSkillSources` 添加新源、`loadSkillSummaries` 处理扫描路径
3. `apps/server/src/ai/tools/SkillSelector.ts` — `SkillScope` 类型、`buildSearchRoots` 添加新源
4. `apps/server/src/routers/settings.ts` — `buildXxxIgnoreKey` 函数、`getSkills` 中 ignoreKey/isEnabled/isDeletable 逻辑、`setSkillEnabled`/`deleteSkill` 处理新 scope
5. `apps/web/src/components/setting/skills/SkillsSettingsPanel.tsx` — `SkillScope` 类型、`SCOPE_LABELS`、`SCOPE_TAG_CLASS`、`buildSkillSummaryText` 计数、`handleOpenSkill` 标题前缀
