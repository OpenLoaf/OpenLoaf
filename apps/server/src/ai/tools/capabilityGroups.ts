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
 * 能力组定义 — 将工具按功能分组，供 Agent 配置使用。
 *
 * 每个能力组包含一组相关的工具 ID，Agent 通过勾选能力组来获得对应工具。
 */

import { resolveToolCatalogItem, type ToolCatalogItem } from "@openloaf/api/types/tools/toolCatalog";

export type CapabilityGroup = {
  /** 能力组 ID。 */
  id: string
  /** 显示名称。 */
  label: string
  /** 描述。 */
  description: string
  /** 包含的工具 ID 列表。 */
  toolIds: readonly string[]
  /** 工具元数据列表。 */
  tools: ToolCatalogItem[]
}

const RAW_CAPABILITY_GROUPS = [
  {
    id: 'browser',
    label: '浏览器操作',
    description: '网页浏览、数据抓取和浏览器自动化',
    toolIds: [
      'OpenUrl',
      'BrowserSnapshot',
      'BrowserObserve',
      'BrowserExtract',
      'BrowserAct',
      'BrowserWait',
      'BrowserScreenshot',
      'BrowserDownloadImage',
    ],
  },
  {
    id: 'file-read',
    label: '文件读取',
    description: '读取文件、列出目录、搜索文件内容',
    toolIds: ['Read', 'Glob', 'Grep', 'FileInfo'],
  },
  {
    id: 'file-write',
    label: '文件写入',
    description: '创建和修改文件',
    toolIds: ['Edit', 'Write', 'EditDocument'],
  },
  {
    id: 'shell',
    label: '终端命令',
    description: '执行 Shell 命令和脚本',
    toolIds: [
      'Bash',
    ],
  },
  {
    id: 'email',
    label: '邮件',
    description: '查询和操作邮件',
    toolIds: ['EmailQuery', 'EmailMutate'],
  },
  {
    id: 'calendar',
    label: '日历',
    description: '查询和操作日历事件',
    toolIds: ['CalendarQuery', 'CalendarMutate'],
  },
  {
    id: 'office',
    label: 'Office 文档',
    description: '读写 Excel 电子表格、Word 文档、PowerPoint 演示文稿和 PDF 文档',
    toolIds: ['ExcelQuery', 'ExcelMutate', 'WordQuery', 'WordMutate', 'PptxQuery', 'PptxMutate', 'PdfQuery', 'PdfMutate'],
  },
  {
    id: 'VideoDownload',
    label: '视频下载',
    description: '通过视频网址下载媒体文件到当前会话或画布资源目录',
    toolIds: ['VideoDownload'],
  },
  {
    id: 'chart',
    label: '图表',
    description: '生成并渲染图表',
    toolIds: ['ChartRender'],
  },
  {
    id: 'widget',
    label: 'Widget',
    description: '创建和管理动态 Widget',
    toolIds: [
      'GenerateWidget',
      'WidgetInit',
      'WidgetList',
      'WidgetGet',
      'WidgetCheck',
    ],
  },
  {
    id: 'project',
    label: '项目管理',
    description: '查询和操作项目数据',
    toolIds: ['ProjectQuery', 'ProjectMutate'],
  },
  {
    id: 'web',
    label: '网络请求',
    description: '发起 HTTP 请求和链接预览',
    toolIds: ['OpenUrl', 'WebFetch'],
  },
  {
    id: 'agent',
    label: '子 Agent',
    description: '创建和管理子 Agent',
    toolIds: ['Agent', 'SendMessage'],
  },
  {
    id: 'code-interpreter',
    label: 'JavaScript REPL',
    description: '在沙箱中执行 JavaScript 代码，支持持久化变量',
    toolIds: ['JsRepl', 'JsReplReset'],
  },
  {
    id: 'convert',
    label: '格式转换',
    description: '图片处理、视频转换、文档格式转换',
    toolIds: ['ImageProcess', 'VideoConvert', 'DocConvert'],
  },
  {
    id: 'system',
    label: '系统工具',
    description: '计划更新等',
    toolIds: [
      'UpdatePlan',
      'JsxCreate',
    ],
  },
]

// 逻辑：按工具 ID 生成显示元信息，避免前端重复维护。
export const CAPABILITY_GROUPS: CapabilityGroup[] = RAW_CAPABILITY_GROUPS.map(
  (group) => ({
    ...group,
    tools: group.toolIds.map((toolId) => resolveToolCatalogItem(toolId)),
  }),
)

/** 能力组 ID → CapabilityGroup 映射。 */
const CAPABILITY_GROUP_MAP = new Map(
  CAPABILITY_GROUPS.map((group) => [group.id, group]),
)
