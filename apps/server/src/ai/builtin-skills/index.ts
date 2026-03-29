/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { BuiltinSkill } from './types'

// 静态导入所有 SKILL.md（esbuild/tsdown .md: "text" 内联）
import openloafBasicsMd from './openloaf-basics/SKILL.md'
import fileOpsMd from './file-ops/SKILL.md'
import emailOpsMd from './email-ops/SKILL.md'
import calendarOpsMd from './calendar-ops/SKILL.md'
import taskOpsMd from './task-ops/SKILL.md'
import canvasOpsMd from './canvas-ops/SKILL.md'
import projectOpsMd from './project-ops/SKILL.md'
import workbenchOpsMd from './workbench-ops/SKILL.md'
import settingsGuideMd from './settings-guide/SKILL.md'
import multiAgentRoutingMd from './multi-agent-routing/SKILL.md'
import systemAgentArchitectureMd from './system-agent-architecture/SKILL.md'
import browserAutomationGuideMd from './browser-automation-guide/SKILL.md'
import officeDocumentGuideMd from './office-document-guide/SKILL.md'
import memoryOpsMd from './memory-ops/SKILL.md'
import mediaOpsMd from './media-ops/SKILL.md'
import visualizationOpsMd from './visualization-ops/SKILL.md'

const FRONT_MATTER_DELIMITER = '---'

function stripFrontMatter(md: string): string {
  const lines = md.split(/\r?\n/u)
  if (lines.length === 0) return ''
  const firstLine = lines[0] ?? ''
  if (firstLine.trim() !== FRONT_MATTER_DELIMITER) {
    return md.trim()
  }
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      return lines.slice(index + 1).join('\n').trim()
    }
  }
  return ''
}

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: 'openloaf-basics',
    description:
      'OpenLoaf 产品全局认知——始终加载。当 AI 需要理解自身所处环境、判断应该用哪类工具、在模块间导航用户、解释 OpenLoaf 功能、回答"你能做什么"、"what features do you have"、"how does OpenLoaf work"、"can you help me with..."、"what tools are available"、"I\'m new here"、"show me around"、"where do I find..."、处理跨模块请求、或在任何页面上下文中工作时，都依赖此 skill 提供的产品地图和决策框架。',
    content: stripFrontMatter(openloafBasicsMd),
    icon: '📚',
    colorIndex: 0,
    tools: ['request-user-input', 'update-plan'],
  },
  {
    name: 'file-ops',
    description:
      '文件读写、目录浏览、内容搜索、文档编辑——当用户在项目文件页面操作，或提及任何文件相关意图（读取、编辑、创建、删除、搜索、浏览目录、查看代码/脚本/配置/日志/数据文件、对比文件、重命名、移动文件、查看文件大小/类型/分辨率）时，必须加载此 skill。',
    content: stripFrontMatter(fileOpsMd),
    icon: '📄',
    colorIndex: 1,
    tools: ['read-file', 'list-dir', 'grep-files', 'apply-patch', 'file-info', 'edit-document'],
  },
  {
    name: 'email-ops',
    description:
      '邮件收发与管理——收件箱、未读、回复、转发、撰写、发送、草稿、搜索邮件、归档、星标、订阅邮件、垃圾邮件处理、contact someone、reach out、let them know、follow up、notify、forward、CC me、unsubscribe、attachment、mailing list。当用户提到邮件、inbox、消息、写信、查信、"有没有人给我发过消息"等任何与电子邮件相关的意图时激活。',
    content: stripFrontMatter(emailOpsMd),
    icon: '📧',
    colorIndex: 2,
    tools: ['email-query', 'email-mutate'],
  },
  {
    name: 'calendar-ops',
    description:
      '日程管理——当用户提到日程、会议、约会、预约、提醒、时间段、空闲、忙碌、冲突、日历、议程、规划一天、接下来做什么、订会议室，甚至随口问"明天有空吗？"或"帮我安排一下"，都应激活此技能',
    content: stripFrontMatter(calendarOpsMd),
    icon: '📅',
    colorIndex: 3,
    tools: ['calendar-query', 'calendar-mutate'],
  },
  {
    name: 'task-ops',
    description:
      '任务管理与调度。触发词：任务、待办、提醒、定时执行、自动化、定期检查、周期性、例行事项、cron、每天/每周/每月做某事、审批、批量操作。当用户描述任何重复性需求（即使未使用"任务"一词）也应激活。',
    content: stripFrontMatter(taskOpsMd),
    icon: '✅',
    colorIndex: 4,
    tools: ['task-manage', 'task-status'],
  },
  {
    name: 'canvas-ops',
    description:
      '画布/白板/图表操作——创建、查看、整理、删除画布。当用户提到画布、白板、图表、流程图、思维导图、可视化布局、节点、头脑风暴、钉板，或者"我想画个图"、"帮我可视化一下"、"做个流程图"等任何与视觉化排布相关的意图时激活。',
    content: stripFrontMatter(canvasOpsMd),
    icon: '🎨',
    colorIndex: 5,
    tools: ['board-query', 'board-mutate'],
  },
  {
    name: 'project-ops',
    description:
      '项目与工作空间管理——创建项目、打开代码仓库、整理项目结构、Git 版本控制。当用户提到项目、工作区、仓库、代码库、文件夹组织、"想开始一个新项目"、"打开我的代码"等意图时触发。',
    content: stripFrontMatter(projectOpsMd),
    icon: '📁',
    colorIndex: 6,
    tools: ['project-query', 'project-mutate'],
  },
  {
    name: 'workbench-ops',
    description:
      '工作台 Widget 管理 — 用户提到 widget、仪表盘、工作台、自定义组件、监控面板、股票行情、天气组件、clock、countdown timer、quick links、bookmarks、system monitor、calendar widget、todo widget、pomodoro、"桌面上加个…"、"一眼看到 X" 时激活',
    content: stripFrontMatter(workbenchOpsMd),
    icon: '🧩',
    colorIndex: 7,
    tools: ['widget-init', 'widget-list', 'widget-get', 'widget-check', 'generate-widget', 'read-file', 'apply-patch'],
  },
  {
    name: 'settings-guide',
    description:
      '应用配置引导 — 用户提到设置、偏好、配置、API key、模型、provider、主题、语言、快捷键、代理、proxy、深色模式、dark mode、"怎么改…"、"哪里设置…"、"怎么换模型"、"怎么配置 provider"、"怎么添加 key"、"怎么切换语言"、"我的设置在哪"、settings、preferences、configuration、排障、"X 不工作了" 时激活',
    content: stripFrontMatter(settingsGuideMd),
    icon: '⚙️',
    colorIndex: 0,
    // 纯引导型，无直接工具
  },
  {
    name: 'multi-agent-routing',
    description:
      '【必读】当你需要：调用 spawn-agent 创建子 Agent、决定是否委派子 Agent、创建跨项目 Task、处理 @mention 路由、规划多 Agent 并行任务、理解页面上下文驱动 Agent 选择、处理 task-report 回报、理解三种交互模式、实现消息路由逻辑、处理 Chat↔Task 双向流转时，立即加载此 skill。',
    content: stripFrontMatter(multiAgentRoutingMd),
    icon: '🔀',
    colorIndex: 1,
    tools: ['spawn-agent', 'send-input', 'wait-agent', 'abort-agent', 'task-manage', 'task-status'],
  },
  {
    name: 'system-agent-architecture',
    description:
      '【必读】当你需要：判断请求由哪个 Agent 处理（Master vs PM vs 子 Agent）、了解 Agent 职责与切换条件、查询子 Agent 能力范围、理解 pageContext 上下文机制、决定是否创建临时项目、理解 Skill 自动加载、处理会话切换逻辑、查阅 Agent 层级拓扑时，立即加载此 skill。',
    content: stripFrontMatter(systemAgentArchitectureMd),
    icon: '🏗️',
    colorIndex: 2,
    // 架构认知层，无直接工具
  },
  {
    name: 'browser-automation-guide',
    description:
      '浏览器自动化操作指南：页面导航、信息提取、表单填写、截图、网页抓取、登录、下载图片。当用户提到 browse、open website、fill form、scrape、extract from page、screenshot、click button、login、navigate、web page、URL、download from site、automate browser、"打开这个网站"、"看看这个页面"、"这个网站写了什么" 时触发。',
    content: stripFrontMatter(browserAutomationGuideMd),
    icon: '🌐',
    colorIndex: 3,
    tools: ['open-url', 'web-search', 'web-fetch', 'browser-snapshot', 'browser-observe', 'browser-act', 'browser-wait', 'browser-extract', 'browser-screenshot', 'browser-download-image'],
  },
  {
    name: 'office-document-guide',
    description:
      'Office 文档操作指南：Excel、Word、PPTX、PDF 的查询、编辑与格式转换。当用户提到 Excel、Word、PowerPoint、PDF、spreadsheet、document、presentation、slides、form、fill form、convert、docx、xlsx、pptx、csv、"打开这个 PDF"、"做个报告"、"做个 PPT"、"编辑这个表格"、table、chart data、合并 PDF、水印、表单填写 时触发。',
    content: stripFrontMatter(officeDocumentGuideMd),
    icon: '📊',
    colorIndex: 4,
    tools: ['excel-query', 'excel-mutate', 'word-query', 'word-mutate', 'pptx-query', 'pptx-mutate', 'pdf-query', 'pdf-mutate', 'doc-convert'],
  },
  {
    name: 'memory-ops',
    description:
      '记忆管理——当用户说"记住"、"别忘了"、"以后都…"、表达个人偏好/习惯（"我不爱吃..."、"我喜欢..."、"我习惯..."、"不要再…"等），或要求忘记/更新某条记忆，或需要回忆之前保存的信息（"你还记得吗"、"之前说过什么"、"我的偏好"、"do you remember"、"what did I tell you"），或在新会话开始时需要延续上次对话的用户偏好时激活。',
    content: stripFrontMatter(memoryOpsMd),
    icon: '🧠',
    colorIndex: 5,
    tools: ['memory-save', 'memory-search', 'memory-get'],
  },
  {
    name: 'media-ops',
    description:
      '媒体处理与下载——图片编辑（缩放、裁剪、旋转、格式转换、压缩）、视频格式转换、音频提取、视频下载。当用户提到视频下载、图片处理、调整大小、裁剪、旋转、格式转换、提取音频、视频转码、"下载这个视频"、"把图片转成 PNG"、"压缩图片"、"提取背景音乐"、"这个视频转 MP4"、resize、crop、blur、convert、"图片太大了"、"转成 webp"、"视频怎么这么大" 时激活。注意：AI 图片/视频生成已迁移到画布 v3，本 skill 仅处理已有文件和网络视频下载。',
    content: stripFrontMatter(mediaOpsMd),
    icon: '🎬',
    colorIndex: 6,
    // 旧媒体生成工具已移除，聊天侧仅保留处理/下载
    tools: ['image-process', 'video-convert', 'video-download'],
  },
  {
    name: 'visualization-ops',
    description:
      '可视化渲染——JSX 组件渲染和 ECharts 图表。当用户需要展示数据图表、可视化卡片、统计面板、任务状态展示、信息汇总卡片、结构化内容展示，或当你需要输出"可视化组件/卡片/布局"而非纯文本时激活。触发词：图表、chart、柱状图、折线图、饼图、可视化、visualization、数据展示、dashboard、卡片展示、render component、"画个图表"、"展示一下数据"、"做个统计图"、"用卡片展示"、"可视化一下"。',
    content: stripFrontMatter(visualizationOpsMd),
    icon: '📈',
    colorIndex: 7,
    tools: ['jsx-create', 'chart-render'],
  },
]
