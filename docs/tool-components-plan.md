# 工具组件拆分方案（Plan）

## 目标
- 将通用渲染从 `MessageTool` 中拆出，给 runtime/file 工具提供独立组件
- 统一审批与输出展示规则：审批前不展示输出与复制按钮
- 保持现有视觉风格与交互逻辑一致

## 相似点（抽象依据）
- 头部：标题 + 状态 + 可选操作按钮
- 内容：输入参数区 + 输出结果区（支持 JSON/纯文本）
- 错误优先：`errorText` 优先展示
- 可折叠：大多数工具需要折叠/展开
- 审批状态：需要统一的审批动作区域

## 组件拆分
1) 通用外壳
   - `ToolCard.tsx`
   - 职责：头部布局、折叠、操作按钮插槽、内容容器
   - Props：`title`、`status`、`actions`、`defaultOpen`、`children`

2) 通用内容块
   - `ToolJsonBlock.tsx`：JSON 预览 + 展开/收起 + 高亮
   - `ToolTextBlock.tsx`：纯文本/错误文本展示
   - `ToolApprovalActions.tsx`：审批按钮（内置 stopPropagation）

3) Runtime 工具组件
   - `ShellTool.tsx`
   - `ShellCommandTool.tsx`
   - `ExecCommandTool.tsx`
   - `WriteStdinTool.tsx`
   - 职责：解析各自输出格式、展示审批区、控制“复制/输出可见性”

4) File 工具组件
   - `ReadFileTool.tsx`
   - `ListDirTool.tsx`
   - `GrepFilesTool.tsx`

5) 兜底组件
   - `GenericTool.tsx`
   - MessageTool 未匹配时使用


## 审批与输出规则
- `state === "approval-requested"`：仅展示审批按钮，不展示复制按钮与输出区域
- 审批完成后：恢复输出与复制按钮

## 实施顺序
1) 添加通用外壳与内容块组件
2) 抽出 runtime 工具组件并接入审批逻辑
3) 抽出 file 工具组件
4) MessageTool 改为路由分发
5) 回归检查现有特殊组件（OpenUrlTool / SubAgentTool / CliThinkingTool）
