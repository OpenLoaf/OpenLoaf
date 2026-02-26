# Browser Troubleshooting

## open-url 超时 / 无回执

**症状**
- Server 报错 `open-url timeout` 或 ack missing。

**常见原因**
- 前端未执行 open-url 或执行后未发送 ack。
- toolCallId 丢失或被重复执行。
- Electron 环境未加载，`waitForWebContentsViewReady` 卡住。

**排查**
- 检查 `[frontend-tool]` 日志与 `/ai/tools/ack` 请求。
- 确认 `frontend-tool-executor.ts` 的 open-url handler 被注册。
- Electron 下确认 `openloaf:webcontents-view:status` 事件有输出。

## 页面一直 loading / overlay 不消失

**症状**
- BrowserLoadingOverlay 永远显示，ready 为 false。

**常见原因**
- `viewKey` 为空或不一致，status 事件无法匹配。
- status 事件未监听或被覆盖。

**排查**
- 检查 `ElectrronBrowserWindow` 的 `[browser-debug]` 日志。
- 确认 viewKey 来自 `__open` 或 `browserTabs` 且唯一。

## browser-act 报错 cdpTargetId missing

**症状**
- `active browser tab cdpTargetId is not available.`

**常见原因**
- `ensureWebContentsView` 没返回 targetId 或未写回。
- `upsertTabSnapshotNow` 未执行，Server 缓存仍旧为空。

**排查**
- 确认 `cdpTargetIds` 已写入 `browserTabs`。
- 检查 `tabSnapshotStore` 是否收到新的快照。

## window.open 未转成新标签

**症状**
- 点击链接打开新窗口或无反应。

**常见原因**
- `windowOpenHandler` 未安装或事件未监听。

**排查**
- Electron 主进程日志 `[webcontents-view] window-open`。
- Renderer 监听 `openloaf:webcontents-view:window-open`。

## 收藏/最近关闭不更新

**症状**
- BrowserHome 中收藏/最近关闭无变化。

**常见原因**
- localStorage 写入失败或事件未触发。

**排查**
- 检查 `openloaf:browser-storage` 事件是否触发。
- 校验 localStorage key 是否正确。
