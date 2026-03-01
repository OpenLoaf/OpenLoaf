# OpenLoaf i18n 组件迁移速查手册

本文档提供常见组件迁移模式的即时参考，帮助快速将硬编码文本转换为多语言支持。

---

## 基础 Pattern：导入 & 初始化

### 最小化导入

```tsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation('nav');
  return <span>{t('sidebar.projectFolder')}</span>;
}
```

### 多 Namespace

```tsx
export function MyComponent() {
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');

  return (
    <>
      <h2>{tNav('workspace.title')}</h2>
      <button>{tCommon('save')}</button>
    </>
  );
}
```

**或者**（数组简写，但需指定 key 前缀）：

```tsx
const { t } = useTranslation(['nav', 'common']);

// 访问时需要明确指定 namespace
<span>{t('nav:sidebar.projectFolder')}</span>
<button>{t('common:save')}</button>
```

---

## Pattern 1: 静态文本替换

### ❌ Before（硬编码）

```tsx
export function Sidebar() {
  return (
    <div>
      <h2>项目文件夹</h2>
      <button>添加项目</button>
      <button>刷新</button>
    </div>
  );
}
```

### ✅ After（使用 i18n）

```tsx
import { useTranslation } from 'react-i18next';

export function Sidebar() {
  const { t } = useTranslation('nav');

  return (
    <div>
      <h2>{t('sidebar.projectFolder')}</h2>
      <button>{t('sidebar.addProject')}</button>
      <button>{t('sidebar.refresh')}</button>
    </div>
  );
}
```

**翻译文件**（JSON）：

```json
// locales/zh-CN/nav.json
{
  "sidebar": {
    "projectFolder": "项目文件夹",
    "addProject": "添加项目",
    "refresh": "刷新"
  }
}

// locales/zh-TW/nav.json
{
  "sidebar": {
    "projectFolder": "專案資料夾",
    "addProject": "新增專案",
    "refresh": "重新整理"
  }
}

// locales/en-US/nav.json
{
  "sidebar": {
    "projectFolder": "Projects",
    "addProject": "Add Project",
    "refresh": "Refresh"
  }
}
```

---

## Pattern 2: 动态变量插值

### ❌ Before（字符串拼接）

```tsx
function TaskCounter({ count }) {
  const message = `已清除 ${count} 个会话`;
  return <p>{message}</p>;
}
```

### ✅ After（使用插值）

```tsx
import { useTranslation } from 'react-i18next';

function TaskCounter({ count }) {
  const { t } = useTranslation('workspace');
  return <p>{t('clearedSessions', { count })}</p>;
}
```

**翻译文件**：

```json
// locales/zh-CN/workspace.json
{ "clearedSessions": "已清除 {{count}} 个会话" }

// locales/zh-TW/workspace.json
{ "clearedSessions": "已清除 {{count}} 個工作階段" }

// locales/en-US/workspace.json
{ "clearedSessions": "Cleared {{count}} sessions" }
```

**使用多个变量**：

```json
{
  "greeting": "您好，{{name}}！今天是 {{date}}"
}
```

```tsx
t('greeting', { name: 'Alice', date: '2026-03-01' })
```

---

## Pattern 3: Toast & Alert 消息

### ❌ Before

```tsx
async function handleSave() {
  try {
    await save();
    toast.success('保存成功');
  } catch (err) {
    toast.error('保存失败');
  }
}
```

### ✅ After

```tsx
import { useTranslation } from 'react-i18next';

function SaveButton() {
  const { t } = useTranslation('common');

  async function handleSave() {
    try {
      await save();
      toast.success(t('success'));
    } catch (err) {
      toast.error(t('saveFailed'));
    }
  }

  return <button onClick={handleSave}>{t('save')}</button>;
}
```

**更复杂的 Toast**：

```tsx
const { t } = useTranslation(['ai', 'common']);

if (error) {
  toast.error(t('ai:messageSendFailed'));  // 从 ai namespace
}

if (success) {
  toast.success(
    t('ai:messagesSaved', { count: n })    // 动态变量
  );
}
```

---

## Pattern 4: 条件文本（三元/Switch）

### ❌ Before

```tsx
function StatusBadge({ status }) {
  const label = status === 'done' ? '已完成' : status === 'pending' ? '待办' : '进行中';
  return <span>{label}</span>;
}
```

### ✅ After（方案 A：Key 数组）

```tsx
import { useTranslation } from 'react-i18next';

function StatusBadge({ status }) {
  const { t } = useTranslation('tasks');

  const statusMap = {
    done: 'taskStatus.done',
    pending: 'taskStatus.todo',
    inProgress: 'taskStatus.inProgress'
  };

  return <span>{t(statusMap[status])}</span>;
}
```

### ✅ After（方案 B：返回对象）

```tsx
function StatusBadge({ status }) {
  const { t } = useTranslation('tasks');

  const statuses = t('allStatuses', { returnObjects: true });
  return <span>{statuses[status]}</span>;
}
```

**对应翻译**（方案 B）：

```json
// locales/zh-CN/tasks.json
{
  "allStatuses": {
    "done": "已完成",
    "pending": "待办",
    "inProgress": "进行中"
  }
}
```

---

## Pattern 5: 列表/数组翻译

### ❌ Before

```tsx
function ActionMenu() {
  const items = [
    { key: 'save', label: '保存' },
    { key: 'delete', label: '删除' },
    { key: 'export', label: '导出' }
  ];
  return (
    <ul>
      {items.map(item => <li key={item.key}>{item.label}</li>)}
    </ul>
  );
}
```

### ✅ After

```tsx
import { useTranslation } from 'react-i18next';

function ActionMenu() {
  const { t } = useTranslation('common');

  const items = [
    { key: 'save', label: t('save') },
    { key: 'delete', label: t('delete') },
    { key: 'export', label: t('export') }
  ];

  return (
    <ul>
      {items.map(item => <li key={item.key}>{item.label}</li>)}
    </ul>
  );
}
```

**或者（从 JSON 返回对象）**：

```tsx
function ActionMenu() {
  const { t } = useTranslation('common');
  const actions = t('actionLabels', { returnObjects: true });

  const items = Object.entries(actions).map(([key, label]) => ({
    key,
    label
  }));

  return (
    <ul>
      {items.map(item => <li key={item.key}>{item.label}</li>)}
    </ul>
  );
}
```

**翻译文件**：

```json
// locales/zh-CN/common.json
{
  "actionLabels": {
    "save": "保存",
    "delete": "删除",
    "export": "导出"
  }
}
```

---

## Pattern 6: 日期 & 数字格式化

### ❌ Before（不考虑 locale）

```tsx
function DateDisplay({ date }) {
  return <span>{date.toLocaleDateString('zh-CN')}</span>;
}
```

### ✅ After（动态 locale 感知）

```tsx
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/en';

function DateDisplay({ date }) {
  const { i18n } = useTranslation();

  // 根据当前语言设置 dayjs locale
  dayjs.locale(i18n.language === 'zh-CN' ? 'zh-cn' :
               i18n.language === 'zh-TW' ? 'zh-tw' :
               'en');

  return <span>{dayjs(date).format('YYYY年M月D日')}</span>;
}
```

**或使用格式化工具**：

```tsx
// apps/web/src/i18n/formatters.ts
import dayjs from 'dayjs';

export function formatDate(date: Date, locale: string): string {
  const formats = {
    'zh-CN': 'YYYY年M月D日',
    'zh-TW': 'YYYY年M月D日',
    'en-US': 'MMMM D, YYYY'
  };

  const dayjsObj = dayjs(date).locale(
    locale === 'zh-CN' ? 'zh-cn' :
    locale === 'zh-TW' ? 'zh-tw' :
    'en'
  );

  return dayjsObj.format(formats[locale] ?? formats['zh-CN']);
}
```

```tsx
import { formatDate } from '@/i18n/formatters';
import { useTranslation } from 'react-i18next';

function DateDisplay({ date }) {
  const { i18n } = useTranslation();
  return <span>{formatDate(date, i18n.language)}</span>;
}
```

---

## Pattern 7: 属性 & Placeholder

### ❌ Before

```tsx
<input
  type="text"
  placeholder="输入您的问题…"
  title="这是一个问题输入框"
  aria-label="问题输入"
/>
```

### ✅ After

```tsx
import { useTranslation } from 'react-i18next';

function QuestionInput() {
  const { t } = useTranslation('ai');

  return (
    <input
      type="text"
      placeholder={t('chat.placeholder')}
      title={t('chat.placeholderTitle')}
      aria-label={t('chat.ariaLabel')}
    />
  );
}
```

**翻译文件**：

```json
// locales/zh-CN/ai.json
{
  "chat": {
    "placeholder": "输入您的问题…",
    "placeholderTitle": "这是一个问题输入框",
    "ariaLabel": "问题输入"
  }
}
```

---

## Pattern 8: HTML 属性中的动态文本

### ❌ Before

```tsx
<button
  disabled={isLoading}
  title={isLoading ? '保存中…' : '点击保存'}
>
  保存
</button>
```

### ✅ After

```tsx
import { useTranslation } from 'react-i18next';

function SaveButton({ isLoading }) {
  const { t } = useTranslation('common');

  return (
    <button
      disabled={isLoading}
      title={isLoading ? t('saving') : t('clickToSave')}
    >
      {t('save')}
    </button>
  );
}
```

---

## Pattern 9: 条件渲染（基于语言）

### 场景：某些功能仅在特定语言可用

```tsx
import { useTranslation } from 'react-i18next';

function FeatureGate() {
  const { i18n } = useTranslation();
  const isChineseUser = i18n.language.startsWith('zh');

  return isChineseUser ? <ChineseFeature /> : <DefaultFeature />;
}
```

### 场景：根据语言选择不同的 UI 布局

```tsx
function ResponsiveText() {
  const { i18n, t } = useTranslation('common');
  const isJapanese = i18n.language === 'ja-JP';

  return (
    <div className={isJapanese ? 'vertical-writing' : 'horizontal-writing'}>
      {t('someKey')}
    </div>
  );
}
```

---

## Pattern 10: 命名空间切换（高级）

### 场景：同一组件中临时切换到另一 namespace

```tsx
import { useTranslation } from 'react-i18next';

export function MixedNamespaceComponent() {
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');

  return (
    <div>
      <h1>{tNav('workspace.title')}</h1>
      <button>{tCommon('save')}</button>
      <label>{tSettings('basic.language')}</label>
    </div>
  );
}
```

---

## Pattern 11: 单元测试中的翻译

### ❌ Before（硬编码）

```tsx
test('renders save button', () => {
  render(<SaveButton />);
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
});
```

### ✅ After（使用 i18n）

```tsx
import { useTranslation } from 'react-i18next';

test('renders save button', () => {
  // 初始化 i18n 用于测试
  const { t } = useTranslation('common');

  render(<SaveButton />);
  expect(screen.getByRole('button', { name: t('save') })).toBeInTheDocument();
});
```

或使用 i18next 测试工具（见 i18next 官方文档）。

---

## Pattern 12: 异步加载（Suspense）

如果翻译文件异步加载，使用 Suspense：

```tsx
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';

function LazyComponent() {
  const { t } = useTranslation('ai', { useSuspense: true });

  return <div>{t('chat.placeholder')}</div>;
}

export function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyComponent />
    </Suspense>
  );
}
```

---

## 检查清单

迁移组件时，依次检查：

- [ ] 导入了 `useTranslation` 和正确的 namespace
- [ ] 所有硬编码的中文/其他语言文本已替换为 `t('key')`
- [ ] 动态变量使用了 `{{variable}}` 插值语法
- [ ] Toast / Alert / Error messages 通过 `t()` 翻译
- [ ] HTML 属性（placeholder、title、aria-label）使用了翻译
- [ ] 新增 key 同时添加到 zh-CN / zh-TW / en-US 三个文件
- [ ] 繁体翻译使用了正确术语（参考 SKILL.md 术语表）
- [ ] 英文翻译符合规范（技术术语保持英文，按钮用现在式）
- [ ] 日期/数字使用了 locale-aware 格式化
- [ ] 没有遗留的注释如 `// TODO: 翻译` 或 `// 待国际化`

---

## 常见错误

### ❌ 错误 1: 忘记导入 useTranslation

```tsx
export function Component() {
  return <span>{t('key')}</span>;  // 错误：t 未定义
}
```

### ✅ 正确

```tsx
import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation('namespace');
  return <span>{t('key')}</span>;
}
```

---

### ❌ 错误 2: 选择了错误的 namespace

```tsx
// locales/zh-CN/nav.json 中有 key，但在 common namespace 中查找
const { t } = useTranslation('common');
t('sidebar.projectFolder');  // 错误：在 common 中找不到这个 key
```

### ✅ 正确

```tsx
const { t } = useTranslation('nav');
t('sidebar.projectFolder');  // 正确
```

---

### ❌ 错误 3: 繁体翻译与简体相同

```json
// locales/zh-TW/nav.json
{ "search": "搜索" }  // 错误：应为繁体 "搜尋"
```

### ✅ 正确

```json
// locales/zh-TW/nav.json
{ "search": "搜尋" }
```

---

### ❌ 错误 4: 忘记添加到全部三个语言文件

```
✅ locales/zh-CN/ai.json  — 已添加 "newChat"
❌ locales/zh-TW/ai.json  — 缺失
❌ locales/en-US/ai.json  — 缺失
```

结果：i18n 报错或 fallback 到中文。

### ✅ 正确

所有三个文件同时添加相同的 key。

---

## 快速参考

| 需求 | 用法 | 示例 |
|------|------|------|
| 静态文本 | `t('key')` | `t('save')` |
| 动态变量 | `t('key', { var })` | `t('greeting', { name: 'Alice' })` |
| 多语言插值 | JSON: `{{var}}` | `"msg": "你好 {{name}}"` |
| 返回对象 | `t('key', { returnObjects: true })` | `const obj = t('statuses', { returnObjects: true })` |
| 切换语言 | `i18n.changeLanguage(lang)` | `i18n.changeLanguage('en-US')` |
| 获取当前语言 | `i18n.language` | `if (i18n.language === 'zh-CN')` |
| 多 namespace | `useTranslation(['ns1', 'ns2'])` + 前缀 | `t('ns1:key')` |
