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

> **术语映射**：翻译 UI 文案时注意 — 代码 `workspace` 对应产品「工作空间」，代码 `project` 对应产品「项目」。

## Overview

OpenLoaf 使用 **react-i18next** + **i18next** 实现完整多语言国际化。系统支持四种主要语言：

- **zh-CN** — 简体中文（默认）
- **zh-TW** — 繁体中文（完整翻译）
- **en-US** — 英文（完整翻译）
- **ja-JP** — 日文（完整翻译）

### 技术架构

**关键特点**：
- ✅ 纯客户端初始化（无需 HTTP backend）→ 兼容静态导出 + Electron
- ✅ Namespace 分割 → 按模块维护翻译，防止单文件过大
- ✅ 动态插值 → 支持变量注入、复数形式
- ✅ FallbackLng → `zh-CN` 作为兜底，缺失的 key 自动回退
- ✅ 与现有 `useBasicConfig().basic.uiLanguage` 集成

### 文件位置

---

## Namespace 映射

下表列出各功能模块对应的 namespace：

| Namespace | 用途 | 核心 UI 组件 |
|-----------|------|-----------|
| **common** | 通用词汇（保存、取消、删除、加载中、搜索等）| 所有组件可用 |
| **nav** | 侧边栏导航、项目空间入口、项目菜单 | Sidebar、SidebarProject、SidebarUserAccount |
| **ai** | AI 对话界面、消息、输入框、代理能力 | Chat、ChatInput、MessageHelper、ApprovalModeSelector |
| **settings** | 所有设置页、偏好项 | SettingsPage、BasicSettings、ThirdPartyTools、ProviderDialog |
| **workspace** | 项目标签、文件系统、项目设置、账户与更新文案 | ProjectTabs、ProjectFileSystem、WorkspaceSettings、SidebarUserAccount |
| **tasks** | 任务管理、看板、日程 | TaskBoardPage、TaskDetailPanel、ScheduledTaskDialog |
| **board** | 画板工具、画布工具栏 | BoardToolbar、BoardCanvas |

**使用规则**：
- 一个组件通常使用 1-2 个 namespace（如 `useTranslation(['ai', 'common'])` 同时使用 AI 和通用）
- 按模块优先选择，不确定则加入 `common` 作为第二选项
- 避免跨 namespace 重复定义相同 key

**说明**：项目中心迁移后，`workspace.json` 不再承载“创建/切换工作空间”文案；这类旧 key 已移除。

---

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

2. **新增文本必须四语齐备**

   添加任何新 key 必须同时在以下四个文件中定义：
   - `locales/zh-CN/namespace.json`
   - `locales/zh-TW/namespace.json`
   - `locales/en-US/namespace.json`
   - `locales/ja-JP/namespace.json`

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

### 多 Namespace 模式

或使用数组简化：

### 动态插值模式

**JSON 定义**：

**代码**：

### 数组/列表翻译（组合模式）

---

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

### 日文规范

- **敬体（です・ます体）**：UI 文案统一使用敬体，如「保存しました」「削除しますか？」
- **技术术語保持英文**：Token、API、ID、URL 等技术术语不翻译
- **产品名称**：OpenLoaf（不翻译）
- **按钮文本**：使用动词连用形或名词形式（保存、削除、作成）
- **カタカナ**：外来语使用片假名（ファイル、フォルダ、プロジェクト）
- **汉字与假名平衡**：避免全汉字堆叠，适当使用假名提升可读性

---

### ctx.lang 已在 Context 中

`packages/api` 的所有 tRPC procedure **都可以访问 `ctx.lang`**——这个字段在 `packages/api/src/context.ts` 中已经从请求头 `x-ui-language` 提取。因此 procedure 中的用户可见消息**应当国际化**，而不是写死中文。

### 为什么不能用 getErrorMessage

`packages/api` **不能** import `apps/server/src/shared/errorMessages.ts`（packages 层不能反向依赖 app 层）。

✅ 正确做法：在 procedure 内用 `ctx.lang` 做内联翻译：

### 纯工具函数（无 ctx）

没有请求上下文的纯工具函数（如 `toolResult.ts` 的 `notImplemented()`）不能做运行时国际化。这类函数：
- 如果是**开发者/技术消息**（错误码、调试信息）→ 直接用英文
- 如果**确实需要国际化** → 给函数增加 `lang?: string` 参数，由调用方传入 `ctx.lang`

### 对比：apps/server 路由

`apps/server/src/routers/` 中的路由**优先使用** `getErrorMessage(key, ctx.lang)`，因为 `errorMessages.ts` 就在同一层，有完整的四语 key 映射，且所有 procedure 都已有 `ctx`。

---

### 何时创建 prompt.en.md

在以下目录为英文用户创建英文版 prompt：

### Prompt 内容管理

**zh-CN / zh-TW**：
- Prompt 内容保持中文（用户与 AI 间的指令）
- UI 标题/标签通过 i18n key 翻译（由 promptBuilder.ts 读取）

**en-US**：
- 整个 prompt 改为英文（包括指令、示例、规则）
- 保持与中文版本的语义一致

### 章节标题国际化

prefaceBuilder.ts 中的章节标题（"会话上下文"、"执行规则"等）创建语言常量：

---

## Key File Map（翻译文件速查）

| 功能 | 翻译文件 | 典型 Keys |
|-----|---------|---------|
| 侧边栏导航 | `nav.json` | `sidebar.*`, `mainNav.*` |
| AI 对话 | `ai.json` | `chat.*`, `message.*`, `model.*` |
| 通用按钮/操作 | `common.json` | `save`, `cancel`, `delete`, `copy` |
| 设置页 | `settings.json` | `basic.*`, `appearance.*`, `provider.*` |
| 项目 / 文件系统 / 账户更新 | `workspace.json` | `project.*`, `filesystem.*`, `settings.*`, `loggedIn` |
| 任务看板 | `tasks.json` | `createTask`, `taskStatus.*` |
| 画板 | `board.json` | `toolbar.*`, `canvas.*` |

---

## 组件迁移检查清单

当修改包含用户可见文本的组件时：

- [ ] 所有硬编码文本已替换为 `t('key')`
- [ ] 导入了 `useTranslation('namespace')`
- [ ] 选择了正确的 namespace
- [ ] 新增的 key 同时添加到 zh-CN / zh-TW / en-US / ja-JP 四个文件
- [ ] 繁体翻译使用了正确术语（参考术语表）
- [ ] 英文翻译符合规范（技术术语保持英文，按钮用现在式）
- [ ] 日文翻译使用敬体、外来语用片假名
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

✅ 正确（使用 `keyPrefix`）：

**重要**：启用 `keyPrefix` 后，不要在 `t()` 调用中再手动加前缀，否则双重叠加：

---

### 陷阱 2：`:` 与 `.` 分隔符混用

**现象**：`t('keyboardShortcuts:title')` 显示原始 key 字符串。

**根因**：`:` 是 i18next 的 **namespace 分隔符**，`.` 是 **key 路径分隔符**。`keyboardShortcuts:title` 表示"去 `keyboardShortcuts` namespace 查找 `title` key"——而不存在此 namespace。

❌ 错误：

✅ 正确：

**规则**：在同一 namespace 内导航用 `.`；跨 namespace 时才用 `:` 或独立 `useTranslation`。

---

### 陷阱 3：titleKey 必须经过 `i18next.t()` 转换

**现象**：Tab 标题栏显示 `nav:aiAssistant`、`nav:workbench` 原始字符串。

**根因**：配置对象中的 `titleKey: "nav:workbench"` 是一个 i18n **key 引用**，不是已翻译的字符串。将其直接存入 state 作为显示标题，就会把原始 key 渲染出来。

❌ 错误：

✅ 正确：在存入 state 前调用 `i18next.t()`：

---

### 陷阱 4：非 React 上下文（Zustand Store / 工具函数）

**现象**：在 Zustand store 或普通函数中无法调用 `useTranslation`（Hooks 只能在 React 组件内使用）。

✅ 正确：直接导入 `i18next` 实例：

**注意**：`i18next.t()` 在 i18n 初始化后可在任何位置调用，与 React 生命周期无关。

---

### 陷阱 5：useMemo 空依赖不响应语言变化

**现象**：切换语言后，菜单/列表标签不更新，只有重启后才生效。

**根因**：`useMemo(() => buildMenuGroups(t), [])` 空依赖数组仅在组件挂载时执行一次，语言切换后 `t` 函数已更新但 useMemo 不会重算。

❌ 错误：

✅ 正确（将 `t` 或包含 `t` 的中间值加入依赖）：

---

### 陷阱 6：组件外静态数组不响应语言变化

**现象**：定义在组件外的含翻译标签的常量数组，语言切换后标签不更新。

**根因**：组件外的常量在模块加载时求值一次，此时 i18n 可能尚未初始化，或之后的语言切换不会触发重新求值。

❌ 错误：

✅ 正确（改写为工厂函数 + 组件内 `useMemo`）：

---

### Q: 我想在静态文本中使用变量怎么办？

A: 使用 i18next 插值：

### Q: 在组件内部创建的字符串数组怎么翻译？

A: 在 JSON 中定义，然后通过枚举方式访问：

### Q: 如何处理复杂的条件文本（如性别、复数）？

A: 使用插值 + 条件逻辑：
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
