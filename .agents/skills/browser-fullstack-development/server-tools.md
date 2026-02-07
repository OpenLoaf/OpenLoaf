# Server Tools & CDP Automation

## open-url Tool

- ToolDef: `packages/api/src/types/tools/browser.ts`
- 实现: `apps/server/src/ai/tools/openUrl.ts`
- 流程：
  1) Server 注册 pending（`pendingRegistry.ts`）。
  2) 前端执行 open-url 并回执 `/ai/tools/ack`。
  3) Server resolve pending 并返回工具结果。

**关键点**：open-url 是前端工具执行链路，不走 runtime UI event。

## Frontend Tool Ack

- 路由: `apps/server/src/ai/interface/routes/frontendToolAckRoutes.ts`
- Ack payload 必须包含 `toolCallId` 与 ISO `requestedAt`。
- 早到回执会暂存（`pendingRegistry.ts`）。

## Browser Automation Tools

- 定义: `packages/api/src/types/tools/browserAutomation.ts`
- 实现: `apps/server/src/ai/tools/browserAutomationTools.ts`
- 依赖：`TabSnapshotStoreAdapter` -> `cdpTargetId`。

错误示例：
- `active browser tab cdpTargetId is not available.`

## Tab Snapshot Store

- TTL 缓存: 15 分钟。
- 使用 `seq` 防止乱序覆盖。
- Router: `apps/server/src/routers/tab.ts`。

## CDP Client

- `cdpClient.ts` 使用 `/json/list` 找到 target 的 websocket URL。
- `cdpSessionPool.ts` 复用 WS session，避免频繁连接。
- 服务器运行时需要 `WebSocket` 可用，否则报错。
