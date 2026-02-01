# EmailPage Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `EmailPage` 拆分为 hook + 多个 UI 组件，结构对齐 `calendar`，保持现有行为不变。

**Architecture:** 数据与状态收敛到 `use-email-page-state.ts`，纯函数抽离到 `email-utils.ts`，共享类型集中在 `email-types.ts`。`EmailPage.tsx` 仅负责布局编排，并组合各子组件。

**Tech Stack:** React/Next.js、TypeScript、@tanstack/react-query、lucide-react、shadcn/ui

---

### Task 1: 抽离类型与工具函数

**Files:**
- Create: `apps/web/src/components/email/email-types.ts`
- Create: `apps/web/src/components/email/email-utils.ts`
- Modify: `apps/web/src/components/email/EmailPage.tsx`

**Step 1: 写失败测试**
- 跳过（按项目规则不做 TDD）。

**Step 2: 运行测试确认失败**
- 跳过。

**Step 3: 写最小实现**
- 将类型与常量移动到 `email-types.ts`。
- 将格式化/解析/排序等纯函数移动到 `email-utils.ts`。
- `EmailPage.tsx` 中保留必要引用，移除重复定义。

**Step 4: 运行测试确认通过**
- 跳过。

**Step 5: 提交**
- 暂不提交，等所有拆分完成后统一提交。

---

### Task 2: 新增 page state hook

**Files:**
- Create: `apps/web/src/components/email/use-email-page-state.ts`
- Modify: `apps/web/src/components/email/EmailPage.tsx`

**Step 1: 写失败测试**
- 跳过（按项目规则不做 TDD）。

**Step 2: 运行测试确认失败**
- 跳过。

**Step 3: 写最小实现**
- 把原 `EmailPage` 内的查询、mutation、状态、handler 移入 hook。
- 维持所有注释规范（方法英文注释、逻辑中文注释）。
- 对外暴露分组的 UI props（sidebar/messageList/detail/addDialog）。

**Step 4: 运行测试确认通过**
- 跳过。

**Step 5: 提交**
- 暂不提交，等待 UI 拆分完成后统一提交。

---

### Task 3: 拆分 UI 组件

**Files:**
- Create: `apps/web/src/components/email/EmailSidebar.tsx`
- Create: `apps/web/src/components/email/EmailMailboxTree.tsx`
- Create: `apps/web/src/components/email/EmailMessageList.tsx`
- Create: `apps/web/src/components/email/EmailMessageDetail.tsx`
- Create: `apps/web/src/components/email/EmailForwardEditor.tsx`
- Create: `apps/web/src/components/email/EmailAddAccountDialog.tsx`

**Step 1: 写失败测试**
- 跳过（按项目规则不做 TDD）。

**Step 2: 运行测试确认失败**
- 跳过。

**Step 3: 写最小实现**
- 逐块迁移 JSX 与相关逻辑到新组件。
- 保持 className 与交互不变。
- DnD 逻辑放到 `EmailMailboxTree.tsx` 内。
- 详情区保留转发编辑与详情展示的现有结构。

**Step 4: 运行测试确认通过**
- 跳过。

**Step 5: 提交**
- 暂不提交，等待 `EmailPage.tsx` 完成组合后统一提交。

---

### Task 4: 组合器与收口

**Files:**
- Modify: `apps/web/src/components/email/EmailPage.tsx`
- Modify: `apps/web/src/utils/panel-utils.ts`（若需调整导入路径/命名）

**Step 1: 写失败测试**
- 跳过（按项目规则不做 TDD）。

**Step 2: 运行测试确认失败**
- 跳过。

**Step 3: 写最小实现**
- `EmailPage` 调用 `use-email-page-state` 并组合子组件。
- 确保导入路径与命名一致。

**Step 4: 运行测试确认通过**
- 可选：`pnpm check-types`（如需验证类型）。

**Step 5: 提交**
- `git add apps/web/src/components/email`
- `git commit -m "refactor: split email page"`

---

### Task 5: 验证与收尾

**Files:**
- N/A

**Step 1: 手动自检**
- 确认邮件列表/详情/转发/添加账号/拖拽排序行为不变。

**Step 2: 可选命令**
- `pnpm check-types`

**Step 3: 提交（如有遗漏）**
- 视情况补交。
