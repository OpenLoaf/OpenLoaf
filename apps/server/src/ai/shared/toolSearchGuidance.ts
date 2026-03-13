/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * 工具目录 — ToolSearch 运行时引导。
 * 提供 tool-search 语法和可用工具能力目录。
 */

import type { ClientPlatform } from '@openloaf/api/types/platform'

/**
 * Build ToolSearch guidance text.
 *
 * Scenarios are filtered by client platform — tools unavailable on
 * the current platform are omitted from the guidance list.
 */
export function buildToolSearchGuidance(platform?: ClientPlatform): string {
  const isWeb = platform === 'web'
  const isCli = platform === 'cli'

  const toolCatalog: string[] = [
    '- time-now：获取当前时间与时区',
    '- calendar-query：查询日程/会议/提醒列表',
    '- calendar-mutate：创建/修改/删除日历事件或提醒（修改/删除前需先 calendar-query 查到 itemId）',
    '- task-manage：创建/修改/取消待办任务或定时提醒（定时任务必须传 schedule 参数）',
    '- task-status：查询待办/任务列表',
    '- email-query：查询/搜索邮件（必须传 mode 参数）',
    '- email-mutate：发送/标记已读/加星标/删除/移动邮件',
    '- read-file, list-dir, grep-files, apply-patch：文件系统读写',
    '- file-info：查看文件元数据（大小、分辨率、时长、页数等）',
  ]

  if (!isWeb && !isCli) {
    toolCatalog.push('- open-url：在系统浏览器中打开链接')
  }

  if (!isCli) {
    toolCatalog.push('- jsx-create：渲染 React 组件/可视化内容')
    toolCatalog.push('- chart-render：绘制图表（折线图、柱状图等）')
  }

  toolCatalog.push(
    '- word-query, word-mutate：Word/docx 文档读写',
    '- excel-query, excel-mutate：Excel/xlsx 电子表格读写',
    '- pptx-query, pptx-mutate：PPT/pptx 演示文稿读写',
    '- pdf-query, pdf-mutate：PDF 文档读取/创建/合并/填表',
    '- image-process：图片处理（缩放、裁剪、格式转换、滤镜）',
    '- video-convert：视频/音频转换（格式转换、提取音频、调整分辨率）',
    '- doc-convert：文档格式转换（Word↔PDF、Excel↔CSV、Markdown↔HTML）',
  )

  return `# 工具目录
通过 tool-search 加载所需工具。

使用方式：
- 关键词搜索：tool-search(query: "file read") — 返回最匹配的工具并立即加载
- 直接选择：tool-search(query: "select:read-file,list-dir") — 按 ID 精确加载
- 可一次加载多个：用逗号分隔 ID

可用工具能力：
${toolCatalog.join('\n')}

补充：
- 浏览器操作（打开网页、截图、网页自动化）→ 用 sub-agent 派发 browser 子代理
- 代码开发请求（提到 Claude Code、帮我开发）→ 用 sub-agent 派发 coder 子代理`
}
