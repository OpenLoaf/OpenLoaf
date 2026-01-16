# tRPC 请求统一为 POST（Web 端）设计

## 目标
- 让 apps/web 端所有 tRPC HTTP 调用（queries + mutations）统一使用 POST。
- 保持 subscriptions 仍使用现有 SSE 通道，不改变协议与行为。

## 现状
- Web 端通过 `apps/web/src/utils/trpc.ts` 创建 tRPC client。
- 使用 `httpBatchLink` 处理 query/mutation；subscriptions 走 `httpSubscriptionLink`。
- 默认情况下，tRPC queries 使用 GET 且输入在 URL query string 中。

## 方案
### 客户端
- 在 `httpBatchLink` 选项中加入 `methodOverride: "POST"`。
- 效果：queries 与 mutations 都通过 POST 发送，输入序列化到 JSON body。
- 订阅链路不变，继续通过 `httpSubscriptionLink`。

### 服务端
- 在 `apps/server/src/bootstrap/createApp.ts` 的 `trpcServer(...)` 中设置 `allowMethodOverride: true`。
- 作用：允许 POST 请求映射到 query/mutation 过程，避免 query 被 POST 拒绝。

## 影响与取舍
- 优点：避免 URL 超长与输入暴露到日志/地址栏；请求方式统一。
- 代价：失去 GET 的缓存语义与基于 URL 的中间层缓存能力。
- 兼容性：不影响路由路径与鉴权；subscriptions 保持不变。

## 风险
- 若服务端未开启 method override，POST query 会返回 METHOD_NOT_SUPPORTED。
- 若有依赖 GET 缓存的中间层或浏览器策略，可能出现命中率下降。

## 验证
- 通过浏览器 Network 面板确认 tRPC query 请求方法为 POST。
- 验证若干查询与变更流程无回归（例如项目列表、设置读取与保存）。
