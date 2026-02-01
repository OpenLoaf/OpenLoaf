# EmailPage 拆分设计（方案一）

## 背景
`apps/web/src/components/email/EmailPage.tsx` 体量过大，包含数据逻辑、状态管理与 UI 渲染，维护成本高。参考 `apps/web/src/components/calendar/` 的拆分方式，将数据逻辑与 UI 组件分离。

## 目标
- 保持现有行为不变，只做结构拆分。
- 将数据与状态集中到 hook 中，UI 组件保持纯渲染。
- 抽离通用工具函数与类型定义，避免循环依赖。

## 非目标
- 不调整 UI/交互，不引入新功能。
- 不修改 API 与服务端逻辑。

## 目录结构
```
apps/web/src/components/email/
  EmailPage.tsx                 # 组合器
  use-email-page-state.ts       # 数据/状态/handler
  email-types.ts                # 共享类型与常量
  email-utils.ts                # 纯函数工具
  EmailSidebar.tsx              # 左侧栏（统一视图 + 账号/文件夹）
  EmailMailboxTree.tsx          # 邮箱树 + DnD
  EmailMessageList.tsx          # 搜索 + 列表
  EmailMessageDetail.tsx        # 详情 + 操作
  EmailForwardEditor.tsx        # 转发编辑
  EmailAddAccountDialog.tsx     # 添加账号弹窗
```

## 数据流与职责
- `use-email-page-state.ts` 负责：React Query 数据、本地状态、业务 handler。
- `EmailPage.tsx` 负责：布局编排与 props 下发。
- UI 组件只接收 props，不直接访问 query/mutation。
- `email-utils.ts` 放置格式化、解析、排序等纯函数。
- `email-types.ts` 统一类型，减少文件间耦合。

## 风险与验证
- 风险：拆分后 props 过多、遗漏依赖。
- 验证：保持渲染结构与交互一致；必要时执行 `pnpm check-types`。
