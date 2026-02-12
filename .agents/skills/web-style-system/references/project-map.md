# Project Map (Outside-In)

## 1. Monorepo Root

- Root workspace: `apps/*` + `packages/*`
- Package manager: `pnpm`
- Task orchestrator: `turbo`
- Core scripts:
  - `pnpm dev`
  - `pnpm dev:web`
  - `pnpm dev:server`
  - `pnpm check-types`

## 2. Apps Layer

### `apps/web` (Primary Design Target)

- Framework: Next.js + React
- Main entry:
  - `apps/web/src/app/layout.tsx`
  - `apps/web/src/app/page.tsx`
- Global style tokens:
  - `apps/web/src/index.css`

### `apps/server`

- Framework: Hono + tRPC + AI/tools runtime
- Entry:
  - `apps/server/src/index.ts`
- Role for UI work: 提供业务能力与 runtime 协议，不直接定义 web 视觉风格。

### `apps/desktop`

- Framework: Electron
- Entry:
  - `apps/desktop/src/main/index.ts`
- Role for UI work: 承载 web 内容与桌面壳交互，不主导 web 视觉系统。

### `apps/tenas-office-plugins`

- 独立插件域，不属于本技能的 web 主设计面。

## 3. Packages Layer

### `packages/ui`

- Shared UI primitives/components
- Key file:
  - `packages/ui/src/animated-tabs.tsx`

### `packages/api`

- Shared routers/types/contracts
- Key file:
  - `packages/api/src/index.ts`

### `packages/db`, `packages/config`, `packages/widget-sdk`

- 数据、配置、widget SDK 支撑层。

## 4. Web Component Domains

重点域（设计统一主战场）：

- `apps/web/src/components/layout`
- `apps/web/src/components/ui`
- `apps/web/src/components/project`
- `apps/web/src/components/chat`
- `apps/web/src/components/board`
- `apps/web/src/components/file`
- `apps/web/src/components/desktop`
- `apps/web/src/components/setting`
- `apps/web/src/components/browser`

## 5. Layout/Tabs Key Chain

核心链路：

1. `apps/web/src/app/page.tsx`
2. `apps/web/src/components/layout/header/Header.tsx`
3. `apps/web/src/components/layout/header/HeaderTabs.tsx`
4. `apps/web/src/components/layout/TabLayout.tsx`
5. `apps/web/src/components/layout/LeftDock.tsx`
6. `apps/web/src/components/project/ProjectTabs.tsx`
7. `apps/web/src/components/ui/ExpandableDockTabs.tsx`
8. `packages/ui/src/animated-tabs.tsx`

## 6. Baseline Sampling Rule

执行风格分析时使用以下规则：

- 必须优先抽样 `layout/tabs/dock`。
- 不把邮箱页与技能页作为“当前样式基线样本”。
- 不从异常样式页反推主设计语言。

说明：

- “不作为基线样本”不等于“永不纳入规范”。
- 当邮箱页与技能页后续重做时，仍按同一规范接入。
