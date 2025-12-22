# 浏览器自动化 Agent 构建计划（MVP）

> 目标：在现有 Teatime AI 架构中构建一个可控、可复用的浏览器自动化 SubAgent，具备最小可用的观察与操作能力，并与现有 open-url / browser-command 链路打通。

## 1. 目标范围（MVP）

- 单页面自动化：只处理当前活动 Tab 的单一 WebContentsView。
- 工具集最小化：observe / snapshot / act / wait / extract / open-url / close。
- 可中断、可审批：危险动作支持 needsApproval，用户手动 stop 可中断并记录。
- 与现有 UI/IPC 链路兼容：沿用 data-open-browser / data-browser-command / reportBrowserCommandResult。

## 2. 角色与执行链路

1. **MasterAgent**：判断需要浏览器操作时调用 `sub-agent` 工具。
2. **BrowserSubAgent**：独立工具循环，执行浏览器相关工具并输出结果。
3. **Server**：负责工具执行与 SSE 传输；不直接操作浏览器。
4. **Web/Electron**：接收 browser-command 并执行 CDP / WebContents 相关动作。

**时序概览：**
- MasterAgent -> sub-agent(tool)
- sub-agent -> browser tools (observe/act/...)
- server -> UI data part: data-browser-command
- web -> electron (IPC runBrowserCommand)
- electron -> CDP 执行 -> 结果回传
- server -> tool output -> sub-agent 继续

## 3. 工具清单与约束

### 3.1 工具定义（ToolDef）
- `open-url`
- `browser-observe`
- `browser-snapshot`
- `browser-act`
- `browser-wait`
- `browser-extract`
- `close`

**统一要求：**
- ToolDef 使用 `id` 作为唯一事实源。
- tool 输入用 zod 约束，输出统一 `{ ok, data, error? }`。

### 3.2 工具执行行为
- observe/snapshot/extract：通过 browser-command 请求 Electron 采集。
- act：通过 browser-command 执行动作（点击/输入/滚动/按键）。
- wait：通过 browser-command 等待条件（load/text/url/timeout）。
- close：明确结束任务并返回最终总结。

### 3.3 需要审批的动作
- 跳转外链、下载、表单提交等敏感动作：`needsApproval: true`。
- 低风险动作（滚动、读取）默认不需要审批。

## 4. Prompt 设计（参考 Stagehand）

采用结构化系统提示：

- `<goal>`：用户目标
- `<page>`：当前 URL / tab
- `<tools>`：列出工具能力与限制
- `<strategy>`：优先 observe -> act 的流程
- `<completion>`：必须调用 close

策略核心：
- 优先利用 observe 获取结构化上下文，再 act。
- act 只使用结构化动作语法，避免自然语言歧义。

## 5. 上下文压缩策略

- 仅保留最近 1 次 observe、最近 2 次 snapshot。
- 超长文本剪裁（如 10k 字符），避免上下文爆炸。
- 旧的 observe/snapshot 用占位文本替换。

## 6. 数据协议与通道

### 6.1 Server -> Web
- data part：`data-browser-command`
- payload：`{ commandId, tabId, viewKey, cdpTargetId, command }`

### 6.2 Web -> Server
- tRPC：`tab.reportBrowserCommandResult`
- payload：`{ sessionId, clientId, tabId, commandId, result }`

## 7. 子代理执行模型

- SubAgent 内部使用 ToolLoopAgent。
- `maxSteps` 默认为 10～15。
- 每一步最多 1 次工具调用。
- 成功结束必须调用 close。

## 8. 可观测性与稳定性

- 记录：每次工具调用、tool output、stop 原因。
- 出错时：写入 message parts + metadata，不影响历史回放。
- 用户手动 stop：追加 `data-manual-stop`。

## 9. 测试计划

1. **open-url 路径**：从聊天触发，浏览器面板打开正确页面。
2. **observe/snapshot**：返回页面摘要与元素候选。
3. **act**：点击按钮 / 输入文本 / 滚动成功。
4. **wait**：`load` / `textIncludes` / `timeout`。
5. **审批**：触发 needsApproval，允许/拒绝后继续执行。
6. **stop**：手动中断后前后端一致显示。

## 10. 后续迭代方向（非 MVP）

- 结构化 DOM/ARIA Tree 采集（替换简易 snapshot）。
- 动作缓存与重放（类似 Stagehand act cache）。
- 多 Tab / 多窗口调度。
- 更精细的风险分级与审批策略。
- UI 层提供可视化回放与动作轨迹。
