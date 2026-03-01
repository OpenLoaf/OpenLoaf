# OpenLoaf i18n 组件迁移执行路线图

## 执行现状

**✅ 第四步进行中：服务端国际化基础设施完成 75%**
**✅ 第三步完成：优先级 1-4 全部组件迁移（Priority 1-4 已全部完成）**

**迁移总结**：
- 🎯 25+ 个核心前端组件已迁移
- 📝 650+ 个翻译 key 已添加
- 🌍 3 种语言完整支持（zh-CN、zh-TW、en-US）
- ✨ 1200+ 硬编码字符串已替换
- 🔧 15+ 个有针对性的 commit 完成迁移

| 任务 | 状态 | 完成度 |
|-----|------|--------|
| ✅ BasicSettings.tsx | 完成 | 100% |
| ✅ Sidebar.tsx | 完成 | 100% |
| ✅ SidebarProject.tsx | 完成 | 100% |
| ✅ SidebarWorkspace.tsx | 完成 | 100% |
| ✅ ChatInput.tsx | 完成 | 100% |
| ✅ ChatModeSelector.tsx | 完成 | 100% |
| ✅ Chat.tsx | 完成 | 100% |
| ✅ ApprovalModeSelector.tsx | 完成 | 100% |
| ✅ MessageHelper.tsx | 完成 | 100% |
| ✅ ProviderDialog.tsx（优先级 3） | 完成 | 100% |
| ✅ LocalAccess.tsx（优先级 3） | 完成 | 100% |
| ✅ Workspace.tsx（优先级 3） | 完成 | 100% |
| ✅ SettingsPage.tsx（优先级 3） | 完成 | 100% |
| ✅ ThirdPartyTools.tsx（优先级 3） | 完成 | 100% |
| ✅ AboutOpenLoaf.tsx（优先级 3） | 完成 | 100% |
| ✅ KeyboardShortcuts.tsx（优先级 3） | 完成 | 100% |
| ✅ ProviderManagement.tsx（优先级 3） | 完成 | 100% |
| ✅ 翻译文件基础建设（优先级 4） | 完成 | 100% |
| ✅ TaskBoardPage.tsx（优先级 4） | 完成 | 100% |
| ✅ BoardToolbar.tsx（优先级 4） | 完成 | 100% |
| ✅ Search.tsx（优先级 4） | 完成 | 100% |
| ✅ TaskDetailPanel.tsx（优先级 4） | 完成 | 100% |
| ✅ TaskTemplateDialog.tsx（优先级 4） | 完成 | 100% |
| ✅ ScheduledTaskList.tsx（优先级 4） | 完成 | 100% |
| ✅ ScheduledTaskDialog.tsx（优先级 4） | 完成 | 100% |
| ✅ ProjectBasicSettings.tsx（优先级 4） | 完成 | 100% |

**已完成的核心基础设施**：
- ✅ i18next 系统初始化
- ✅ 21 个翻译文件（zh-CN、zh-TW、en-US）
- ✅ 系统语言检测 + 自动检测
- ✅ useLanguageSync hook 集成
- ✅ BasicSettings 实时语言切换功能
- ✅ 优先级 1-4 组件迁移完成（25+ 组件，600+ 翻译 key，1000+ 硬编码字符串替换）

**第四步：服务端国际化（Priority 5）进度**：
- ✅ 工作空间配置多语言化（8 种语言映射）
- ✅ Tab 标题国际化（titleKey + i18next 翻译）
- ✅ AI Agent Prompt 完全多语言化（10 个 prompt.en.md，586 行）
- ✅ agentFactory 多语言基础设施（getTemplatePrompt 函数）
- ✅ chatCommands 英文化
- ✅ Calendar eventForm 翻译（3 个键完整支持）
- ⏳ tRPC 路由错误消息国际化（context.ts 支持lang；errorMessages.ts 创建；workspace/chat 已更新；settings 部分更新）
- ✅ Tool description 多语言框架（task、email、calendar、browser 已支持 getter 函数）

---

## 组件迁移标准流程

### Phase 1：准备（2 分钟）

1. **查看 Skill 文档**
   ```bash
   # 打开迁移指南快速查看
   cat .agents/skills/web-i18n-system/references/migration-guide.md
   ```

2. **列出所有硬编码文本**
   - 使用正则搜索中文字符
   - 记录每个 key 应属的 namespace

### Phase 2：翻译文件补充（如需要）

如果遇到新的术语未在翻译文件中定义，需要：

1. **添加到所有 3 个语言文件**：
   ```json
   // apps/web/src/i18n/locales/zh-CN/{namespace}.json
   { "newKey": "中文文本" }

   // apps/web/src/i18n/locales/zh-TW/{namespace}.json
   { "newKey": "繁體文本" }

   // apps/web/src/i18n/locales/en-US/{namespace}.json
   { "newKey": "English text" }
   ```

2. **更新 Skill 参考文档**：
   ```bash
   # 在 .agents/skills/web-i18n-system/references/translation-keys.md 中记录新 key
   ```

### Phase 3：代码迁移（主要步骤）

#### 步骤 1：导入 Hook

```tsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation('namespace');  // 指定 namespace
  // ...
}
```

#### 步骤 2：替换文本

**Pattern A：简单文本**
```tsx
// ❌ Before
<span>保存</span>

// ✅ After
const { t } = useTranslation('common');
<span>{t('save')}</span>
```

**Pattern B：Tooltip / 属性**
```tsx
// ❌ Before
<button tooltip="保存">Save</button>

// ✅ After
const { t } = useTranslation('common');
<button tooltip={t('save')}>Save</button>
```

**Pattern C：动态文本**
```tsx
// ❌ Before
toast(`已清除 ${count} 个会话`);

// ✅ After
const { t } = useTranslation('workspace');
toast(t('clearedSessions', { count }));

// JSON 中定义：
// "clearedSessions": "已清除 {{count}} 个会话"
```

#### 步骤 3：处理列表 & 映射

```tsx
// ❌ Before
const languageLabelById = {
  "zh-CN": "中文（简体）",
  "en-US": "English",
};

// ✅ After
import { SUPPORTED_UI_LANGUAGES } from '@/i18n/types';

const languageLabelById = Object.fromEntries(
  SUPPORTED_UI_LANGUAGES.map(l => [l.value, l.label])
);
```

### Phase 4：验证（3 分钟）

1. **类型检查**
   ```bash
   pnpm run check-types
   ```

2. **本地测试**
   ```bash
   # 启动开发服务器
   pnpm run dev:web

   # 在设置页切换语言，验证变更是否实时反映
   ```

3. **翻译质量检查**
   - 简体 → 繁体：检查是否使用了正确的繁体术语表中的词汇
   - 英文：检查技术术语是否保持英文（Token、API、OAuth 等）

### Phase 5：提交

```bash
git add apps/web/src/components/...
git commit -m "feat(component-name): migrate to i18n multi-language support

- Import useTranslation hook from react-i18next
- Replace {{n}} hardcoded Chinese/English strings with t() calls
- Support zh-CN, zh-TW, en-US with real-time switching
- Update {namespace}.json with new keys

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## 优先级 1 组件详细计划

### 1. Sidebar.tsx（已启动）

**关键文本**：
- "搜索" → `nav:search`
- "AI 助手" → `nav:aiAssistant`
- "工作台" → `nav:workbench`
- "日历" → `nav:calendar`
- "邮箱" → `nav:email`
- "任务" → `nav:tasks`

**迁移复杂度**：高（458 行，多个动态标题）

**建议方法**：
1. 在文件顶部创建翻译映射对象
2. 逐个替换 tooltip 和 label
3. 注意 `title` 变量可能来自动态 tab 数据，需要在调用端处理

**示例**：
```tsx
export const AppSidebar = () => {
  const { t } = useTranslation('nav');

  const mainMenuItems = {
    search: { tooltip: t('search'), label: t('search') },
    aiAssistant: { tooltip: t('aiAssistant'), label: t('aiAssistant') },
    // ... 其他菜单项
  };

  return (
    <SidebarMenuButton tooltip={mainMenuItems.search.tooltip}>
      {mainMenuItems.search.label}
    </SidebarMenuButton>
  );
};
```

### 2. SidebarProject.tsx

**关键文本**：
- "项目文件夹" → `nav:sidebar.projectFolder`
- "刷新" → `nav:sidebar.refresh`
- "添加项目" → `nav:sidebar.addProject`
- 等等

**迁移复杂度**：中

### 3. SidebarWorkspace.tsx

**关键文本**：
- "工作空间" → `nav:workspace.title`
- "选择工作空间" → `nav:workspace.selectWorkspace`
- 等等

**迁移复杂度**：中

---

## 优先级 2：AI 对话相关

### 待迁移组件
- Chat.tsx
- ChatInput.tsx
- MessageHelper.tsx
- ApprovalModeSelector.tsx

**关键 namespace**：`ai`, `common`

---

## 优先级 3：Settings 页

### 待迁移组件
- ProviderDialog.tsx
- ThirdPartyTools.tsx
- KeyboardShortcuts.tsx
- LocalAccess.tsx

**关键 namespace**：`settings`, `common`

---

## 优先级 4：功能模块

### 待迁移组件
- TaskBoardPage.tsx
- BoardToolbar.tsx
- 等等

**关键 namespace**：`tasks`, `board`, `workspace`

---

## 常见问题

### Q：如何处理从 API 返回的动态标题？

A：不翻译从 API 返回的用户数据。只翻译固定的 UI 标签。

```tsx
// ✅ 正确：UI 标签翻译
<div>{t('nav:workbench')}</div>

// ❌ 错误：用户数据不应翻译
<div>{userCreatedProjectName}</div>
```

### Q：如何处理可选的翻译 key？

A：使用 fallback 提供默认值：

```tsx
<span>{t('newKey') || '备用文本'}</span>
```

### Q：icon 和图标应该翻译吗？

A：不需要。icon 的 `title` / `aria-label` 需要翻译。

```tsx
// ❌ 错误
const icon = "保存";

// ✅ 正确
<button aria-label={t('common:save')}>
  <SaveIcon />
</button>
```

### Q：如何验证所有 namespace 都被正确引入？

A：运行类型检查：

```bash
pnpm run check-types
```

---

## 批量迁移脚本（可选）

对于包含大量硬编码文本的文件，可以使用以下命令列出所有中文字符串：

```bash
# 列出包含中文的行（便于统计）
grep -n "[\u4e00-\u9fa5]" apps/web/src/components/path/Component.tsx | head -20
```

---

## 成功标准

✅ 每个组件迁移完成时应满足：

1. 所有面向用户的文本已通过 `t()` 翻译
2. 新增 key 同时出现在 zh-CN / zh-TW / en-US
3. 代码通过 `pnpm run check-types`
4. 本地测试语言切换生效
5. Git commit message 遵循约定

---

## 后续工作

**第四步（非本次范围）**：
- [ ] 服务端错误消息国际化（tRPC routers）
- [ ] AI Prompt 国际化（zh.md → en.md）
- [ ] Calendar 子组件国际化（事件表单、日期格式）
- [ ] 其他 packages/ 层的 schema 国际化

---

## 相关文件

- **Skill 文档**：`.agents/skills/web-i18n-system/SKILL.md`
- **参考指南**：`.agents/skills/web-i18n-system/references/migration-guide.md`
- **翻译资源**：`apps/web/src/i18n/locales/{lang}/`
- **类型定义**：`apps/web/src/i18n/types.ts`
