# TestApprovalSubAgent 设计

## 背景
当前已有 BrowserSubAgent 与 DocumentAnalysisSubAgent。需要新增一个用于测试审批流程的子代理，并提供获取当前时间的工具，以便验证审批链路与系统时间输出。

## 目标
- 新增 TestApprovalSubAgent，可在 sub-agent 工具中被选择。
- 子代理仅暴露审批测试与时间工具，保证权限最小化。
- 保持主 SSE 流式输出与历史记录逻辑一致。

## 范围
- 仅涉及 server 子代理与 sub-agent 工具注册。
- 不改动前端渲染逻辑。

## 方案
- 新增 `testApprovalSubAgent.ts` 与 `testApprovalSubAgent.zh.md`。
- `subAgentNames` 增加 `TestApprovalSubAgent`。
- `subAgentTool` 根据 name 创建对应子代理实例。
- 子代理工具集包含 `test-approval` 与 `time-now`。

## 数据流
1. LLM 调用 `sub-agent`，name=TestApprovalSubAgent。
2. server 创建 ToolLoopAgent，加载系统提示词与工具集。
3. 子代理执行：先调用 `time-now`，再调用 `test-approval`。
4. 结果通过 UIMessageChunk 流回主 SSE，并保存为子代理历史消息。

## 变更点
- 新增子代理文件与提示词。
- 更新 sub-agent 工具定义与白名单。

## 风险
- 未注册 name 会触发错误（已在 subAgentTool 校验）。
- 审批链路若未配置会导致测试工具无法完成（需外部环境保证）。

## 验证
- 发起一次子代理任务：获取时间 + 触发审批。
- 观察 SSE 中 `data-sub-agent-chunk` 与 `data-sub-agent-end` 是否正常。
- 审批通过后返回结果，确认时间字段与审批时间可见。
