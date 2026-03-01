---
name: web-i18n-system
description: >
  Use this skill when adding new UI text, modifying existing display strings,
  creating new components with user-visible text, or working on any
  internationalization (i18n) related tasks. This skill defines the complete
  i18n architecture, namespace structure, translation guidelines, and component
  migration patterns for OpenLoaf's multi-language support.

  TRIGGERS ON: "添加文本", "翻译", "多语言", "i18n", "新增文字", "界面文字",
  "国际化", "add text", "translate", "localization", "language", "international",
  "i18n system", "translation file"
version: 0.1.0
---

# OpenLoaf i18n System Skill

## Overview

OpenLoaf 使用 **react-i18next** + **i18next** 实现完整多语言国际化。系统支持三种主要语言：

- **zh-CN** — 简体中文（默认）
- **zh-TW** — 繁体中文（完整翻译）
- **en-US** — 英文（完整翻译）

### 技术架构

```
前端 (Next.js + React) → react-i18next → i18next engine
                                             ↓
                                    Namespace-based JSON files
                                   (locales/*/namespace.json)
```

**关键特点**：
- ✅ 纯客户端初始化（无需 HTTP backend）→ 兼容静态导出 + Electron
- ✅ Namespace 分割 → 按模块维护翻译，防止单文件过大
- ✅ 动态插值 → 支持变量注入、复数形式
- ✅ FallbackLng → `zh-CN` 作为兜底，缺失的 key 自动回退
- ✅ 与现有 `useBasicConfig().basic.uiLanguage` 集成

### 文件位置

```
apps/web/src/i18n/
├── types.ts                           ← LanguageId、SUPPORTED_UI_LANGUAGES
├── index.ts                           ← i18next 初始化
├── detectLanguage.ts                  ← 系统语言自动检测
├── useLanguageSync.ts                 ← React hook，同步 DB 与 i18n 状态
└── locales/
    ├── zh-CN/
    │   ├── common.json               ← 通用词汇
    │   ├── nav.json                  ← 侧边栏、导航
    │   ├── ai.json                   ← AI 对话界面
    │   ├── settings.json             ← 所有设置页
    │   ├── workspace.json            ← 工作空间管理
    │   ├── tasks.json                ← 任务管理
    │   └── board.json                ← 画板工具
    ├── zh-TW/                        ← 繁体中文（同结构）
    └── en-US/                        ← 英文（同结构）
```

---

## Namespace 映射

下表列出各功能模块对应的 namespace：

| Namespace | 用途 | 核心 UI 组件 |
|-----------|------|-----------|
| **common** | 通用词汇（保存、取消、删除、加载中、搜索等）| 所有组件可用 |
| **nav** | 侧边栏导航、工作区、项目菜单 | Sidebar、SidebarProject、SidebarWorkspace |
| **ai** | AI 对话界面、消息、输入框、代理能力 | Chat、ChatInput、MessageHelper、ApprovalModeSelector |
| **settings** | 所有设置页、偏好项 | SettingsPage、BasicSettings、ThirdPartyTools、ProviderDialog |
| **workspace** | 工作空间操作、文件管理、选项卡 | WorkspaceManager、TabBar、FileExplorer |
| **tasks** | 任务管理、看板、日程 | TaskBoardPage、TaskDetailPanel、ScheduledTaskDialog |
| **board** | 画板工具、画布工具栏 | BoardToolbar、BoardCanvas |

**使用规则**：
- 一个组件通常使用 1-2 个 namespace（如 `useTranslation(['ai', 'common'])` 同时使用 AI 和通用）
- 按模块优先选择，不确定则加入 `common` 作为第二选项
- 避免跨 namespace 重复定义相同 key

---

## 开发规则（MUST DO）

### ✅ 强制规范

1. **禁止硬编码任何面向用户的文字**

   ❌ 错误：
   ```tsx
   <span>项目文件夹</span>
   <button onClick={handleSave}>保存</button>
   toast('操作成功')
   ```

   ✅ 正确：
   ```tsx
   const { t } = useTranslation('nav');
   <span>{t('sidebar.projectFolder')}</span>

   const { t: tCommon } = useTranslation('common');
   <button onClick={handleSave}>{tCommon('save')}</button>

   toast(t('workspace.operationSuccess'))
   ```

2. **新增文本必须三语齐备**

   添加任何新 key 必须同时在以下三个文件中定义：
   - `locales/zh-CN/namespace.json`
   - `locales/zh-TW/namespace.json`
   - `locales/en-US/namespace.json`

   如果某个语言缺失，部署时会报错。

3. **繁体中文不能与简体相同**

   ❌ 错误：
   ```json
   // zh-TW/nav.json
   { "search": "搜索" }  ← 与简体完全相同，应翻译为繁体
   ```

   ✅ 正确：
   ```json
   // zh-TW/nav.json
   { "search": "搜尋" }  ← 正确的繁体用词
   ```

   常见词对照见下文"翻译质量要求"。

4. **使用 namespace 而非全局 defaultNS**

   ❌ 错误：
   ```tsx
   const { t } = useTranslation();  // 依赖 defaultNS: 'common'
   t('sidebar.projectFolder')       // 跨 namespace 访问
   ```

   ✅ 正确：
   ```tsx
   const { t } = useTranslation('nav');
   t('sidebar.projectFolder')
   ```

5. **动态变量使用插值语法**

   ❌ 错误：
   ```tsx
   const msg = `已清除 ${count} 个会话`;
   ```

   ✅ 正确：
   ```tsx
   // locales/zh-CN/workspace.json
   { "clearedSessions": "已清除 {{count}} 个会话" }

   // 组件
   const { t } = useTranslation('workspace');
   t('clearedSessions', { count: n })
   ```

6. **Toast/Alert/Error 消息走翻译**

   ❌ 错误：
   ```tsx
   if (error) toast.error('保存失败');
   ```

   ✅ 正确：
   ```tsx
   const { t } = useTranslation('common');
   if (error) toast.error(t('saveFailed'));
   ```

---

## 使用模式

### 基础模式

```tsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation('nav');  // 指定 namespace

  return <button>{t('save')}</button>;  // 访问 nav namespace 中的 key
}
```

### 多 Namespace 模式

```tsx
const { t: tNav } = useTranslation('nav');
const { t: tCommon } = useTranslation('common');

return (
  <>
    <span>{tNav('sidebar.projectFolder')}</span>
    <button>{tCommon('save')}</button>
  </>
);
```

或使用数组简化：
```tsx
const { t: tNav } = useTranslation(['nav', 'common']);
// 现在 tNav 同时包含两个 namespace 的 keys
```

### 动态插值模式

**JSON 定义**：
```json
{
  "greeting": "你好，{{name}}！",
  "itemCount": "共 {{count}} 项",
  "plural": "你有 {{count}} 个提醒"
}
```

**代码**：
```tsx
const { t } = useTranslation('common');
t('greeting', { name: '小李' })      // → "你好，小李！"
t('itemCount', { count: 5 })        // → "共 5 项"
```

### 复数形式（如支持）

```json
{
  "itemDeleted_one": "已删除 1 项",
  "itemDeleted_other": "已删除 {{count}} 项"
}
```

```tsx
t('itemDeleted', { count })  // i18next 自动选择单数/复数
```

### 嵌套 Key 模式

```json
{
  "sidebar": {
    "projectFolder": "项目文件夹",
    "addProject": "添加项目"
  }
}
```

```tsx
const { t } = useTranslation('nav');
t('sidebar.projectFolder')   // → "项目文件夹"
t('sidebar.addProject')      // → "添加项目"
```

### 数组/列表翻译（组合模式）

```tsx
const items = [
  { key: 'save', label: t('common:save') },
  { key: 'delete', label: t('common:delete') },
];
```

---

## 翻译质量要求

### 简体 → 繁体常见术语对照

| 简体 | 繁体 | 含义 |
|-----|-----|-----|
| 搜索 | 搜尋 | Search |
| 日历 | 行事曆 | Calendar |
| 邮箱 | 信箱 | Email |
| 文件夹 | 資料夾 | Folder |
| 设置 | 設定 | Settings |
| 工作空间 | 工作區 | Workspace |
| 工作台 | 工作台 | Workbench |
| 项目 | 專案 | Project |
| 任务 | 任務 | Task |
| 确认 | 確認 | Confirm |
| 取消 | 取消 | Cancel |
| 删除 | 刪除 | Delete |
| 添加 | 新增 | Add |
| 编辑 | 編輯 | Edit |
| 导出 | 匯出 | Export |
| 导入 | 匯入 | Import |
| 创建 | 建立 | Create |
| 新建 | 新建 | Create (as prefix) |
| 开始 | 開始 | Start |
| 结束 | 結束 | End |
| 保存 | 保存 | Save |
| 刷新 | 重新整理 | Refresh |
| 加载中 | 載入中 | Loading |
| 已复制 | 已複製 | Copied |
| 选择 | 選擇 | Select |
| 管理 | 管理 | Manage |
| 详情 | 詳情 | Details |
| 返回 | 返回 | Back |
| 关闭 | 關閉 | Close |
| 提交 | 提交 | Submit |
| 草稿 | 草稿 | Draft |
| 发布 | 發佈 | Publish |

**繁体规范**：
- 使用台湾繁体（zh-TW，非港澳繁体）
- 优先使用"设定"（IT 术语标准）而非"設置"
- 不使用简体标点（。、，），改为繁体（。、，）

### 英文规范

- **技术术语保持英文**：Token、API、ID、URL、tRPC、Hono、Prisma、OAuth
- **产品名称**：OpenLoaf（不翻译）、SVIP（不翻译）
- **时间格式**：使用标准英文格式如 "March 1, 2026" 或 "1 Mar 2026"
- **按钮文本**：使用现在式动词（Save、Delete、Create）
- **句式**：标准英文大小写（首字母大写，其余小写，除非是专有名词）

---

## packages/api 层的 i18n

### ctx.lang 已在 Context 中

`packages/api` 的所有 tRPC procedure **都可以访问 `ctx.lang`**——这个字段在 `packages/api/src/context.ts` 中已经从请求头 `x-ui-language` 提取。因此 procedure 中的用户可见消息**应当国际化**，而不是写死中文。

```ts
// packages/api/src/context.ts（已有实现）
const lang = honoContext.req.header("x-ui-language") || "zh-CN";
return { session: null, prisma, lang };
```

### 为什么不能用 getErrorMessage

`packages/api` **不能** import `apps/server/src/shared/errorMessages.ts`（packages 层不能反向依赖 app 层）。

✅ 正确做法：在 procedure 内用 `ctx.lang` 做内联翻译：

```ts
// packages/api/src/routers/fs.ts
searchWorkspace: shieldedProcedure
  .input(fsSearchWorkspaceSchema)
  .query(async ({ input, ctx }) => {  // ← 加入 ctx

    const untitledLabel =
      ctx.lang === 'en-US' ? 'Untitled Project' :
      ctx.lang === 'zh-TW' ? '未命名專案' :
      '未命名项目';

    const projectTitle = project.title?.trim() || untitledLabel;
  }),
```

### 纯工具函数（无 ctx）

没有请求上下文的纯工具函数（如 `toolResult.ts` 的 `notImplemented()`）不能做运行时国际化。这类函数：
- 如果是**开发者/技术消息**（错误码、调试信息）→ 直接用英文
- 如果**确实需要国际化** → 给函数增加 `lang?: string` 参数，由调用方传入 `ctx.lang`

### 对比：apps/server 路由

`apps/server/src/routers/` 中的路由**优先使用** `getErrorMessage(key, ctx.lang)`，因为 `errorMessages.ts` 就在同一层，有完整的三语 key 映射，且所有 procedure 都已有 `ctx`。

---

## AI Prompt 规则

### 何时创建 prompt.en.md

在以下目录为英文用户创建英文版 prompt：

```
apps/server/src/ai/agent-templates/templates/{agent}/
├── prompt.zh.md     ← 既有（简体中文）
└── prompt.en.md     ← **新增**（英文版本）

apps/server/src/ai/shared/templates/
├── SOUL.zh.md → SOUL.en.md
├── IDENTITY.zh.md → IDENTITY.en.md
├── AGENT.zh.md → AGENT.en.md
```

### Prompt 内容管理

**zh-CN / zh-TW**：
- Prompt 内容保持中文（用户与 AI 间的指令）
- UI 标题/标签通过 i18n key 翻译（由 promptBuilder.ts 读取）

**en-US**：
- 整个 prompt 改为英文（包括指令、示例、规则）
- 保持与中文版本的语义一致

### promptBuilder.ts 多语言实现

```typescript
// apps/server/src/ai/shared/promptBuilder.ts
function getLangSuffix(lang: string): string {
  if (lang === 'zh-CN' || lang === 'zh-TW') return 'zh';
  if (lang === 'en-US') return 'en';
  return 'zh';  // fallback 中文
}

async function loadPrompt(templatePath: string, lang: string) {
  const suffix = getLangSuffix(lang);
  return readFile(`${templatePath}/prompt.${suffix}.md`);
}
```

### 章节标题国际化

prefaceBuilder.ts 中的章节标题（"会话上下文"、"执行规则"等）创建语言常量：

```typescript
const SECTION_TITLES = {
  'zh-CN': {
    sessionContext: '# 会话上下文',
    rules: '# 执行规则（强制）',
    examples: '# 示例',
    tools: '# 可用工具'
  },
  'en-US': {
    sessionContext: '# Session Context',
    rules: '# Execution Rules (Mandatory)',
    examples: '# Examples',
    tools: '# Available Tools'
  }
};
```

---

## Key File Map（翻译文件速查）

| 功能 | 翻译文件 | 典型 Keys |
|-----|---------|---------|
| 侧边栏导航 | `nav.json` | `sidebar.*`, `mainNav.*` |
| AI 对话 | `ai.json` | `chat.*`, `message.*`, `model.*` |
| 通用按钮/操作 | `common.json` | `save`, `cancel`, `delete`, `copy` |
| 设置页 | `settings.json` | `basic.*`, `appearance.*`, `provider.*` |
| 工作空间 | `workspace.json` | `createWorkspace`, `selectProject` |
| 任务看板 | `tasks.json` | `createTask`, `taskStatus.*` |
| 画板 | `board.json` | `toolbar.*`, `canvas.*` |

---

## 组件迁移检查清单

当修改包含用户可见文本的组件时：

- [ ] 所有硬编码文本已替换为 `t('key')`
- [ ] 导入了 `useTranslation('namespace')`
- [ ] 选择了正确的 namespace
- [ ] 新增的 key 同时添加到 zh-CN / zh-TW / en-US 三个文件
- [ ] 繁体翻译使用了正确术语（参考术语表）
- [ ] 英文翻译符合规范（技术术语保持英文，按钮用现在式）
- [ ] 动态内容使用了插值语法（`{{variable}}`）
- [ ] Toast/Alert 消息通过 `t()` 翻译
- [ ] 日期/数字使用了 locale-aware 格式化（如 `dayjs.locale(lang)`）

---

## 常见陷阱（实战经验）

以下陷阱来自真实 bug 修复，请在迁移时重点核查。

### 陷阱 1：JSON 顶层包装键与 keyPrefix

**现象**：`workspace.json` 结构是 `{ "workspace": { "title": "..." } }`，组件用 `t('title')` 却找不到 key，直接返回原始字符串。

**根因**：`workspace.json` 把所有 UI key 都嵌套在顶层 `workspace` 对象下，而 `t('title')` 在根级查找，路径不匹配。

❌ 错误：
```tsx
const { t } = useTranslation('workspace');
t('settings.accountInfo')  // → 返回原始 key（workspace.json 中实为 workspace.settings.accountInfo）
```

✅ 正确（使用 `keyPrefix`）：
```tsx
const { t } = useTranslation('workspace', { keyPrefix: 'workspace' });
t('settings.accountInfo')  // → 自动拼接为 workspace.settings.accountInfo，正确匹配
```

**重要**：启用 `keyPrefix` 后，不要在 `t()` 调用中再手动加前缀，否则双重叠加：
```tsx
// ❌ 双重前缀（keyPrefix: 'workspace' 已有效）
t('workspace.settings.clearChatConfirm', { countText })  // → workspace.workspace.settings.clearChatConfirm

// ✅ 去掉冗余前缀
t('settings.clearChatConfirm', { countText })
```

---

### 陷阱 2：`:` 与 `.` 分隔符混用

**现象**：`t('keyboardShortcuts:title')` 显示原始 key 字符串。

**根因**：`:` 是 i18next 的 **namespace 分隔符**，`.` 是 **key 路径分隔符**。`keyboardShortcuts:title` 表示"去 `keyboardShortcuts` namespace 查找 `title` key"——而不存在此 namespace。

❌ 错误：
```tsx
const { t } = useTranslation('settings');
t(`keyboardShortcuts:${keyPath}`)  // 被解析为 namespace "keyboardShortcuts"，找不到
```

✅ 正确：
```tsx
const { t } = useTranslation('settings');
t(`keyboardShortcuts.${keyPath}`)  // 在 settings namespace 中查找 keyboardShortcuts.xxx
```

**规则**：在同一 namespace 内导航用 `.`；跨 namespace 时才用 `:` 或独立 `useTranslation`。

---

### 陷阱 3：titleKey 必须经过 `i18next.t()` 转换

**现象**：Tab 标题栏显示 `nav:aiAssistant`、`nav:workbench` 原始字符串。

**根因**：配置对象中的 `titleKey: "nav:workbench"` 是一个 i18n **key 引用**，不是已翻译的字符串。将其直接存入 state 作为显示标题，就会把原始 key 渲染出来。

❌ 错误：
```ts
// use-tabs.ts (Zustand store)
title: DEFAULT_TAB_INFO.titleKey          // 存储的是 "nav:workbench" 原始字符串
```

```tsx
// Sidebar.tsx
const tabTitle = input.titleKey ?? input.title ?? '';  // 同上
```

✅ 正确：在存入 state 前调用 `i18next.t()`：
```ts
import i18next from 'i18next';

title: i18next.t(DEFAULT_TAB_INFO.titleKey)   // 翻译后再存储
```

```tsx
import i18next from 'i18next';

const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '');
```

---

### 陷阱 4：非 React 上下文（Zustand Store / 工具函数）

**现象**：在 Zustand store 或普通函数中无法调用 `useTranslation`（Hooks 只能在 React 组件内使用）。

✅ 正确：直接导入 `i18next` 实例：
```ts
import i18next from 'i18next';

// 在 Zustand action / 工具函数中
function resolveToolDisplayName(toolId: string): string {
  return i18next.t(`toolNames.${toolId}`, { ns: 'ai', defaultValue: toolId });
}
```

**注意**：`i18next.t()` 在 i18n 初始化后可在任何位置调用，与 React 生命周期无关。

---

### 陷阱 5：useMemo 空依赖不响应语言变化

**现象**：切换语言后，菜单/列表标签不更新，只有重启后才生效。

**根因**：`useMemo(() => buildMenuGroups(t), [])` 空依赖数组仅在组件挂载时执行一次，语言切换后 `t` 函数已更新但 useMemo 不会重算。

❌ 错误：
```tsx
const menuGroups = useMemo(() => buildMenuGroups(t), []);  // 永远不重算
```

✅ 正确（将 `t` 或包含 `t` 的中间值加入依赖）：
```tsx
const menuGroups = useMemo(() => buildMenuGroups(t), [t]);
// 或者
const MENU = useMemo(() => buildMenuConst(t), [t]);
const menuGroups = useMemo(() => buildMenuGroups(MENU), [MENU]);
```

---

### 陷阱 6：组件外静态数组不响应语言变化

**现象**：定义在组件外的含翻译标签的常量数组，语言切换后标签不更新。

**根因**：组件外的常量在模块加载时求值一次，此时 i18n 可能尚未初始化，或之后的语言切换不会触发重新求值。

❌ 错误：
```tsx
// 在组件外定义（模块级别），语言变化时不会更新
const WORKSPACE_SWITCH_TABS = [
  { id: 'workbench', label: '工作台', title: WORKBENCH_TAB_INPUT.titleKey },
  ...
];

export default function WorkspaceSwitchDockTabs() {
  // WORKSPACE_SWITCH_TABS 是固定的，切换语言后 label 不变
  return <ExpandableDockTabs tabs={WORKSPACE_SWITCH_TABS} ... />;
}
```

✅ 正确（改写为工厂函数 + 组件内 `useMemo`）：
```tsx
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

function buildWorkspaceSwitchTabs(t: (key: string) => string) {
  return [
    { id: 'workbench', label: t('nav:workbench'), title: t('nav:workbench'), ... },
    { id: 'calendar', label: t('nav:calendar'), title: t('nav:calendar'), ... },
  ];
}

export default function WorkspaceSwitchDockTabs() {
  const { t } = useTranslation();
  const tabs = useMemo(() => buildWorkspaceSwitchTabs(t), [t]);
  return <ExpandableDockTabs tabs={tabs} ... />;
}
```

---

## FAQ

### Q: 我想在静态文本中使用变量怎么办？

A: 使用 i18next 插值：
```json
{ "welcome": "欢迎，{{user}}！" }
```
```tsx
t('welcome', { user: 'Alice' })
```

### Q: 在组件内部创建的字符串数组怎么翻译？

A: 在 JSON 中定义，然后通过枚举方式访问：
```json
{ "taskStatuses": ["待办", "进行中", "已完成"] }
```
```tsx
const statuses = t('taskStatuses', { returnObjects: true });
statuses[0]  // → "待办"
```

### Q: 如何处理复杂的条件文本（如性别、复数）？

A: 使用插值 + 条件逻辑：
```json
{
  "itemAdded_one": "添加了 1 项",
  "itemAdded_other": "添加了 {{count}} 项"
}
```
i18next 自动根据 `count` 选择单数/复数。

### Q: 某个 key 找不到会怎样？

A:
- 如果在 zh-CN 有定义 → 返回 zh-CN 的值（fallback）
- 如果也在 zh-CN 中缺失 → 返回 key 本身（如 `"sidebar.missing"` 会显示原文）
- 控制台会输出警告 → 便于查找遗漏

---

## 参考资源

- **完整 Key 目录** → 见 `references/translation-keys.md`
- **组件迁移示例** → 见 `references/migration-guide.md`
- **i18next 官方文档** → https://www.i18next.com/overview/getting-started
- **react-i18next 文档** → https://react.i18next.com/
