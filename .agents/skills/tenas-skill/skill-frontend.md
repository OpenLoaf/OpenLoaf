# Skill Frontend

## SkillsSettingsPanel.tsx

**路径**: `apps/web/src/components/setting/skills/SkillsSettingsPanel.tsx`

### 组件结构

```
SkillsSettingsPanel({ projectId? })
├── TenasSettingsGroup (标题 + 摘要 + 打开目录按钮)
│   └── 技能列表 (divide-y 分隔)
│       └── 每条技能
│           ├── 名称 + ScopeTag (全局/工作空间/项目)
│           ├── 描述 (line-clamp-2)
│           ├── 删除按钮 (仅 isDeletable 时显示)
│           ├── 查看按钮 (Eye → 打开文件树预览)
│           └── 启用开关 (Switch)
├── 加载中状态
├── 空状态提示
└── 错误状态
```

### Scope 标签配置

```typescript
type SkillScope = "workspace" | "project" | "global";

const SCOPE_LABELS: Record<SkillScope, string> = {
  workspace: "工作空间",
  project: "项目",
  global: "全局",
};

const SCOPE_TAG_CLASS: Record<SkillScope, string> = {
  workspace: "border-border bg-muted text-muted-foreground",
  project: "border-border bg-background text-foreground/80",
  global: "border-border bg-muted/60 text-muted-foreground/80",
};
```

添加新 scope 时需同步更新这三处。

### tRPC 调用

```typescript
// 查询技能列表
const skillsQuery = useQuery(
  trpc.settings.getSkills.queryOptions({ projectId })
);

// 启用/禁用
updateSkillMutation.mutate({
  scope,           // "workspace" | "project" | "global"
  projectId,
  ignoreKey,
  enabled,
});

// 删除
deleteSkillMutation.mutateAsync({
  scope,
  projectId,
  ignoreKey,
  skillPath,
});
```

变更成功后通过 `queryClient.invalidateQueries()` 刷新列表。

### 交互逻辑

#### 打开技能目录 (handleOpenSkillsRoot)

1. 调用 `trpc.fs.mkdir` 确保 `.agents/skills` 目录存在
2. 通过 `window.tenasElectron.openPath()` 在系统文件管理器中打开
3. 仅 Electron 环境可用，Web 版提示不支持

#### 查看技能 (handleOpenSkill)

1. 根据 scope 确定 baseRootUri：
   - `global` → `undefined`（绝对路径，通过 `toFileUri` 转换）
   - `project` → `projectData.project.rootUri`
   - `workspace` → `workspace.rootUri`
2. `resolveSkillFolderUri()` 解析技能文件夹 URI
3. `pushStackItem()` 在 Tab Stack 中打开 `folder-tree-preview` 组件
4. 标题前缀：全局技能 → "全局技能"，项目技能 → "项目技能"，工作空间技能 → "工作空间技能"

#### 切换启用 (handleToggleSkill)

- 工作空间视图：scope 固定为 `"workspace"`（ignoreKey 已包含 `global:` 或 `workspace:` 前缀）
- 项目视图：scope 固定为 `"project"`
- 服务端根据 scope 决定写入工作空间配置还是项目配置

#### 删除技能 (handleDeleteSkill)

- 仅 `isDeletable === true` 时显示删除按钮
- 全局技能永远不可删除（`isDeletable: false`）
- 弹出 `window.confirm()` 确认后执行

### 摘要文本

`buildSkillSummaryText()` 根据技能列表生成摘要：

| 场景 | 输出格式 |
|------|----------|
| 项目视图 | `共 N 条（全局 X / 工作空间 Y / 项目 Z）` |
| 工作空间视图（有全局技能） | `共 N 条（全局 X / 工作空间 Y）` |
| 工作空间视图（无全局技能） | `共 N 条` |

### URI 工具函数

面板内定义了多个 URI 处理函数，用于将技能文件路径转换为可用的 file:// URI：

- `normalizePath(value)` — 统一路径分隔符为 `/`
- `toFileUri(value)` — 本地路径 → `file://` URI
- `resolveSkillFolderUri(skillPath, baseRootUri)` — 解析技能文件夹 URI（支持绝对路径和相对路径���
- `resolveSkillUri(skillPath, rootUri)` — 解析技能文件 URI（用于预览）

### 使用位置

`SkillsSettingsPanel` 在两个场景中使用：

1. **工作空间设置** — 不传 `projectId`，显示工作空间级 + 全局级技能
2. **项目设置** — 传入 `projectId`，显示项目级 + 工作空间级 + 全局级技能（工作空间级别关闭的技能不显示）
