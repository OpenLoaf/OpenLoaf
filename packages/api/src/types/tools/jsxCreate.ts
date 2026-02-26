import { z } from 'zod'

/** JSX create tool definition. */
export const jsxCreateToolDef = {
  id: 'jsx-create',
  name: '组件渲染',
  description:
    '用途：渲染 JSX 字符串并展示内容，同时把内容写入会话目录的 jsx 文件。\n'
    + '使用方法：直接传入 JSX 字符串，不要封装为对象，也不要附加 actionName。\n'
    + '示例："<div className=\\"p-4 text-sm\\">...</div>"。\n'
    + '注意事项：\n'
    + '- 当你需要输出“可视化组件/卡片/布局”，应优先使用本工具而非纯文本。\n'
    + '- 只写 JSX 片段，不要写 import/export/const/函数定义。\n'
    + '- 允许 `{}` 表达式、map、条件渲染与 style={{...}}。\n'
    + '- 不支持 `{...}` 属性/子节点展开（例如 {...props}）。\n'
    + '- 不要使用 Message/Panel/Snippet/Task/WebPreview 等带外框的组件。\n'
    + '- 不要为外层容器添加 border/box-shadow/ring/outline 等外框样式。\n'
    + '- 建议优先生成横向较宽的组件布局，避免纵向过长导致滚动与占位过高。\n'
    + '- 交互式表单收集请用 request-user-input，本工具仅负责展示。\n'
    + '- 服务端会校验 JSX 语法，违规会直接报错。\n'
    + '- 校验失败仍会写入文件，错误信息中会包含 path，请用 apply-patch 修正后刷新预览。\n'
    + '- 每条回复只调用一次 jsx-create；若失败必须用 apply-patch 修正，不要重新调用。\n'
    + '可用组件白名单（大小写敏感，包含但不建议用作外框）：\n'
    + '- Message, MessageContent\n'
    + '- Panel\n'
    + '- Snippet, SnippetAddon, SnippetText, SnippetInput, SnippetCopyButton\n'
    + '- CodeBlock\n'
    + '- Checkpoint\n'
    + '- Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile\n'
    + '- Image\n'
    + '- Attachments, Attachment\n'
    + '- AudioPlayer, AudioPlayerElement, AudioPlayerControlBar, AudioPlayerPlayButton, AudioPlayerSeekBackwardButton, AudioPlayerSeekForwardButton, AudioPlayerTimeDisplay, AudioPlayerTimeRange, AudioPlayerDurationDisplay, AudioPlayerMuteButton, AudioPlayerVolumeRange\n'
    + '- WebPreview, WebPreviewNavigation, WebPreviewNavigationButton, WebPreviewUrl, WebPreviewBody, WebPreviewConsole\n'
    + '写入位置：.openloaf/chat-history/<sessionId>/jsx/<messageId>.jsx。\n'
    + '返回：{ ok: true, path: string, messageId: string }。\n'
    + '注意：调用该工具后不要再向用户重复输出 JSX 代码，工具会在前端直接展示渲染结果。\n'
    + '注意：只能使用白名单组件与原生 HTML，禁止传入 bindings；修改请用 apply-patch。',
  parameters: z.string().min(1).describe('JSX 字符串内容。'),
  needsApproval: false,
  component: null,
} as const
