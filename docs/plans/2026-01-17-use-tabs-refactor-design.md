# use-tabs 重构设计稿

**目标**
清理 `use-tabs` 内的重复逻辑与类型定义，统一 browser/terminal 面板行为，并在 web 与 server 之间共享单一事实来源的常量与类型，提升可维护性与一致性。

**范围**
- 包含前端 `apps/web` 的 hook 与相关组件
- 包含 server 侧 `apps/server/src/modules/tab/TabSnapshotStoreAdapter.ts`
- 可接受不兼容调整（localStorage 迁移版本升级、旧字段清理）

## 设计结论（方案 B）
采用“模块拆分 + 共享类型常量”的中等改造方案：  
前端拆分 `use-tabs` 内聚逻辑；共享 `BrowserTab`/`TerminalTab`/面板常量到 `packages/api`，并让 server 与 web 统一引用。

## 结构调整

### 1) 共享类型与常量
新增 `packages/api/src/types/tabs.ts`（导出并在 `@tenas-ai/api/common` re-export）：
- `BrowserTab`、`TerminalTab`
- `BROWSER_WINDOW_COMPONENT`、`TERMINAL_WINDOW_COMPONENT`
- `BROWSER_WINDOW_PANEL_ID`、`TERMINAL_WINDOW_PANEL_ID`
- 需要时补充 `TabPanelId`、`PanelComponentId` 等轻量别名

**目的**：消除字符串与类型的重复定义，避免 web/server 漂移。

### 2) 前端模块拆分
将 `apps/web/src/hooks/use-tabs.ts` 拆为三层：
- `apps/web/src/hooks/use-tabs.ts`：Zustand store 定义与对外 API
- `apps/web/src/hooks/tab-utils.ts`：纯函数与通用逻辑  
  - `clampPercent`、`normalizeDock`、`updateTabById`、`getActiveStackItem`
  - `isBoardStackFull`/`shouldExitBoardFullOnClose`（去重复取值）
- `apps/web/src/hooks/browser-panel.ts`：browser 面板规则  
  - `normalizeBrowserWindowItem`、`getBrowserTabs`、`getActiveBrowserTabId`
  - open/merge 与未知 params 保留策略
- `apps/web/src/hooks/terminal-panel.ts`：terminal 面板规则  
  - `normalizeTerminalWindowItem`、`getTerminalTabs`、`getActiveTerminalTabId`
  - legacy 字段折叠与 open/merge

### 3) 统一 tab id 生成
新增 `apps/web/src/hooks/tab-id.ts`，集中 `createBrowserTabId`、`createTerminalTabId`：
- `ElectrronBrowserWindow.tsx`、`TerminalViewer.tsx` 统一复用
- 去掉 `Date.now()` 与 `randomUUID()` 混用导致的格式漂移

### 4) server 侧对齐
`apps/server/src/modules/tab/TabSnapshotStoreAdapter.ts`：
- 引用 `BROWSER_WINDOW_COMPONENT` 等共享常量
- 避免硬编码字符串导致识别失败

## 数据与迁移策略（v5）
- 将持久化版本升级为 v5
- 迁移时统一折叠 legacy 字段（`leftWidthPx`、`pwdUri` 等）
- 对结构异常或字段缺失的条目执行“最小可用重建”
- 清理双写字段，确保只有单一来源（例如 `TerminalTab` 只保留 `params.pwdUri`）

## params 合并策略
`normalizeBrowserWindowItem`/`normalizeTerminalWindowItem` 调整为：
- 保留未知 params
- 仅覆盖已知字段（`*Tabs`、`active*TabId`、`__refreshKey`、`__customHeader`）
避免扩展字段被误清导致 UI 回滚。

## 风险与控制
- `use-tabs` 是高频路径，拆分过程中需保留对外 API 不变
- localStorage 迁移需避免错误清空可用数据
- 组件侧依赖 `BrowserTab`/`TerminalTab` 的 import 路径会变更

## 测试策略
优先为纯函数补轻量单测（如已有测试框架）：
1) legacy 字段迁移：`leftWidthPx`、`pwdUri` 折叠后结构正确  
2) open/merge：active id 选择规则正确  
3) 未知 params 保留  
4) `setBrowserTabs`/`setTerminalTabs` 不回滚已关闭 tab

若项目无测试框架，可先保证 hook 分层后用手动场景回归。

## 预期效果
- `use-tabs` 体积缩小，职责清晰
- browser/terminal 面板逻辑集中，重复代码减少
- web/server 共享单一类型与常量，减少漂移风险
