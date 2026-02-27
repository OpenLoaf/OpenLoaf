# OpenLoaf UI 设计系统

本项目采用 Gmail 风格的扁平色设计系统。所有新建 UI 模块**必须**遵循以下规范，确保与邮件、任务等模块视觉一致。

参考实现：
- `apps/web/src/components/email/email-style-system.ts` — 核心样式常量
- `apps/web/src/components/email/EmailSidebar.tsx` — 侧边栏、按钮
- `apps/web/src/components/email/EmailMessageList.tsx` — 工具栏、列表
- `apps/web/src/components/tasks/TaskBoardPage.tsx` — Kanban、筛选标签

---

## 1. 色板

所有颜色必须同时提供 light / dark 两套值。

### 语义色

| 语义 | Light | Dark | 用途 |
|------|-------|------|------|
| 蓝色（主要） | `#1a73e8` | `sky-300` | 收件箱、待办、主操作 |
| 琥珀色 | `#f9ab00` | `amber-300` | 星标、进行中、条件触发 |
| 紫色 | `#9334e6` | `violet-300` | 草稿、审批、定时 |
| 绿色 | `#188038` | `emerald-300` | 已发送、已完成、手动 |
| 红色 | `#d93025` | `red-300` / `rose-300` | 删除、紧急 |
| 橙色 | `#e37400` / `#f4511e` | `amber-300` / `orange-300` | 高优先级、垃圾 |
| 灰色 | `#5f6368` | `slate-300` / `slate-400` | 默认文本、禁用、低优先级 |

### 中性色

| 用途 | Light | Dark |
|------|-------|------|
| 主文本 | `#202124` | `slate-50` |
| 次文本 | `#3c4043` | `slate-300` |
| 辅助文本 | `#5f6368` | `slate-400` |
| 分隔线 | `#e3e8ef` | `slate-700` |
| 面板背景 | `#ffffff` | `hsl(var(--background)/0.9)` |
| 内嵌背景 | `#f6f8fc` | `hsl(var(--muted)/0.26)` |
| 输入框背景 | `#edf2fa` | `hsl(var(--muted)/0.38)` |
| 悬停背景 | `#f1f3f4` | `hsl(var(--muted)/0.42)` |
| 选中背景 | `#d3e3fd` | `sky-800/60` |
| 行选中背景 | `#e8f0fe` | `sky-900/50` |

---

## 2. 按钮

### 主操作按钮（Compose 风格）

用于页面内最核心的操作（新建邮件、新建任务）。

```
rounded-full / rounded-2xl
bg-[淡色背景] text-[深色文字]
hover:bg-[稍深背景]
shadow-none
transition-colors duration-150
```

**示例：**
- 蓝色主按钮：`bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70`
- 琥珀色按钮：`bg-[#fef7e0] text-[#e37400] hover:bg-[#fcefc8] dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60`
- 紫色按钮：`bg-[#f3e8fd] text-[#9334e6] hover:bg-[#e9d5fb] dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60`
- 绿色按钮：`bg-[#e6f4ea] text-[#188038] hover:bg-[#ceead6] dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60`

### 图标操作按钮

工具栏中的圆形图标按钮，每种操作对应固定颜色。

```
h-8 w-8 rounded-full
text-[语义色]
hover:bg-[hsl(var(--muted)/0.58)]
transition-colors duration-150
dark:text-[语义色dark] dark:hover:bg-[hsl(var(--muted)/0.46)]
```

### 视图切换（Segmented Control）

```
外壳: rounded-full bg-[#f1f3f4] p-0.5 dark:bg-[hsl(var(--muted)/0.38)]
活跃: bg-white text-[#1a73e8] shadow-sm dark:bg-[hsl(var(--background)/0.9)] dark:text-sky-300
非活跃: text-[#5f6368] hover:text-[#202124] dark:text-slate-400 dark:hover:text-slate-200
每项: rounded-full p-1.5 transition-colors duration-150
```

---

## 3. 筛选标签（Filter Pills）

使用 `rounded-full` 胶囊样式，不用 `<Badge>`，用原生 `<button>`。

```
rounded-full px-2.5 py-0.5 text-[11px] font-medium
border border-transparent
transition-colors duration-150
```

- **活跃态**：实色背景 + 白字，如 `bg-[#1a73e8] text-white`
- **非活跃态**：淡色背景 + 彩色文字 + hover 加深，如 `bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc]`

每个筛选项的颜色必须语义化——优先级用红/橙/蓝/灰，触发方式用绿/紫/琥珀。

---

## 4. 输入框

### 扁平搜索/输入框

```
rounded-full
border-transparent bg-[#edf2fa]
text-[#1f1f1f] placeholder:text-[#5f6368]
focus-visible:border-[#d2e3fc] focus-visible:ring-[rgba(26,115,232,0.22)]
dark:bg-[hsl(var(--muted)/0.38)] dark:text-slate-100 dark:placeholder:text-slate-400
```

搜索图标使用 `text-[#5f6368] dark:text-slate-400`。

---

## 5. 面板与容器

| 类型 | 样式 |
|------|------|
| 主面板 | `rounded-2xl bg-[#ffffff] shadow-none dark:bg-[hsl(var(--background)/0.9)]` |
| 分割面板 | `rounded-lg border border-border/55 bg-[hsl(var(--background)/0.95)]` |
| 内嵌区域 | `rounded-xl bg-[#f6f8fc] border border-transparent dark:bg-[hsl(var(--muted)/0.26)]` |
| 列背景（Kanban） | 极淡语义色背景，如 `bg-[#f8faff] dark:bg-sky-950/10` |

---

## 6. 列表行

### 交互状态

| 状态 | 样式 |
|------|------|
| 悬停 | `hover:bg-[#f1f3f4] dark:hover:bg-[hsl(var(--muted)/0.42)]` |
| 选中 | `bg-[#e8f0fe] dark:bg-sky-900/50` |
| 活跃 | `bg-[#d3e3fd] text-[#001d35] font-semibold dark:bg-sky-800/60 dark:text-sky-50` |

### 文本层级

| 层级 | Light | Dark |
|------|-------|------|
| 标题（未读） | `font-semibold text-[#202124]` | `text-slate-50` |
| 标题（已读） | `font-medium text-[#3c4043]` | `text-slate-300` |
| 辅助信息 | `text-[#5f6368]` | `text-slate-400` |

### 状态指示点

圆形小点 `h-2 w-2 rounded-full`，颜色对应语义色。

---

## 7. Badge / Chip

### 元数据 Chip

```
rounded-full bg-[#e8eaed] px-2 py-0.5 text-[11px] text-[#5f6368]
dark:bg-[hsl(var(--muted)/0.44)] dark:text-slate-200
```

### 状态 Badge（Kanban 列头）

使用语义色淡底 + 彩色文字，无边框：

```
border-0 text-[10px]
bg-[语义淡色] text-[语义深色]
dark:bg-[语义色-900/40] dark:text-[语义色-300]
```

---

## 8. 图标

- 尺寸统一：工具栏 `h-3.5 w-3.5`，列表内联 `h-3 w-3`，Kanban 列头 `h-4 w-4`
- 颜色：遵循语义色，不使用灰色图标（除非语义就是"默认/禁用"）
- 禁止对列头图标添加 `animate-spin`

---

## 9. 分隔线

```
border-[#e3e8ef] dark:border-slate-700
```

用于列表行分割、筛选区域内垂直分隔（`h-3.5 w-px`）。

---

## 10. 布局规范

### Toolbar 布局

当页面内容可能受左侧面板宽度压缩时，Toolbar 必须拆分为多行：

```
flex flex-col gap-1.5 border-b px-4 py-2
  Row 1: flex justify-between → 标题 + 操作按钮（不换行）
  Row 2: FilterBar（独立一行，内部 flex-wrap 允许自适应）
```

**禁止**将标题、筛选器、操作按钮放在单行 `flex justify-between` 中。

### Kanban 列

- 最小宽度 `min-w-[240px]`
- 列容器 `flex-1`
- 列背景使用极淡语义色
- 拖拽 hover 态 `ring-2 ring-primary/50`

---

## 11. 过渡动画

所有可交互元素添加 `transition-colors duration-150`。

禁止在状态指示图标上使用 `animate-spin`（loading 指示器除外）。

---

## 12. Dark Mode 规则

1. Light 用具体 hex（`#1a73e8`），Dark 用 Tailwind 色阶（`sky-300`）
2. 背景色 Dark 用 `hsl(var(--muted)/透明度)` 或 `语义色-900/透明度`
3. 透明度梯度：背景 `30-50%`，hover `50-70%`，active `60-80%`
4. 每个颜色值都必须有 `dark:` 对应
