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
 * Shared fixture data for tool showcase.
 * Used by both:
 * - apps/server/scripts/seed-tool-showcase.ts (seed script)
 * - apps/web/src/components/ai/message/__tests__/MessageToolShowcase.vitest.tsx (component test)
 */

export type ToolShowcasePart = {
  type: string
  toolCallId: string
  toolName: string
  state: string
  input: Record<string, unknown>
  output: Record<string, unknown>
}

export type ToolShowcaseGroup = {
  label: string
  parts: ToolShowcasePart[]
}

let callCounter = 0
function callId() {
  return `call_showcase_${++callCounter}`
}

// ─── Group 1: 系统/Agent ────────────────────────────────────────────────

const systemAgentParts: ToolShowcasePart[] = [
  {
    type: 'tool-ToolSearch',
    toolCallId: callId(),
    toolName: 'ToolSearch',
    state: 'output-available',
    input: { query: '文件管理' },
    output: { ok: true, data: { tools: ['read-file', 'list-dir', 'grep-files', 'apply-patch'] } },
  },
  {
    type: 'tool-time-now',
    toolCallId: callId(),
    toolName: 'time-now',
    state: 'output-available',
    input: { actionName: '获取当前时间' },
    output: { ok: true, data: { iso: '2026-03-09T10:30:00+08:00', unix: 1773041400, timezone: 'Asia/Shanghai' } },
  },
  {
    type: 'tool-Agent',
    toolCallId: callId(),
    toolName: 'Agent',
    state: 'output-available',
    input: {
      agentType: 'coder',
      items: [{ type: 'text', text: '重构 UserService 类以支持多租户' }],
    },
    output: { ok: true, data: { agent_id: 'agent_abc123' } },
  },
  {
    type: 'tool-SendMessage',
    toolCallId: callId(),
    toolName: 'SendMessage',
    state: 'output-available',
    input: { actionName: '发送消息', agentId: 'agent_abc123', text: '使用 TypeORM 替代 Prisma' },
    output: { ok: true },
  },
]

// ─── Group 2: 文件操作 ────────────────────────────────────────────────

const fileOpParts: ToolShowcasePart[] = [
  {
    type: 'tool-read-file',
    toolCallId: callId(),
    toolName: 'read-file',
    state: 'output-available',
    input: { actionName: '读取配置文件', filePath: '/project-root/tsconfig.json' },
    output: {
      ok: true,
      data: {
        content: '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ESNext",\n    "strict": true\n  }\n}',
        encoding: 'utf-8',
        size: 128,
      },
    },
  },
  {
    type: 'tool-list-dir',
    toolCallId: callId(),
    toolName: 'list-dir',
    state: 'output-available',
    input: { actionName: '列出目录', dirPath: '/project-root/src' },
    output: {
      ok: true,
      data: {
        entries: [
          { name: 'index.ts', type: 'file', size: 2048 },
          { name: 'utils', type: 'directory' },
          { name: 'components', type: 'directory' },
          { name: 'README.md', type: 'file', size: 512 },
        ],
      },
    },
  },
  {
    type: 'tool-grep-files',
    toolCallId: callId(),
    toolName: 'grep-files',
    state: 'output-available',
    input: { actionName: '搜索文件内容', pattern: 'TODO', directory: '/project-root/src' },
    output: {
      ok: true,
      data: {
        matches: [
          { file: 'src/utils/auth.ts', line: 42, text: '// TODO: implement refresh token logic' },
          { file: 'src/services/email.ts', line: 108, text: '// TODO: add retry mechanism' },
          { file: 'src/components/Dashboard.tsx', line: 23, text: '{/* TODO: add error boundary */}' },
        ],
        totalMatches: 3,
      },
    },
  },
  {
    type: 'tool-apply-patch',
    toolCallId: callId(),
    toolName: 'apply-patch',
    state: 'output-available',
    input: {
      patch: [
        '*** Update File: src/utils/auth.ts',
        '@@@ -40,5 +40,12 @@@',
        '   const token = getToken()',
        '   if (!token) return null',
        '-  // TODO: implement refresh token logic',
        '-  return null',
        '+  try {',
        '+    const refreshed = await refreshToken(token)',
        '+    if (refreshed) {',
        '+      setToken(refreshed.accessToken)',
        '+      return refreshed',
        '+    }',
        '+  } catch (err) {',
        '+    logger.error("Token refresh failed", err)',
        '+  }',
        '+  return null',
      ].join('\n'),
    },
    output: { ok: true, data: { applied: true } },
  },
  {
    type: 'tool-FileInfo',
    toolCallId: callId(),
    toolName: 'FileInfo',
    state: 'output-available',
    input: { actionName: '获取文件信息', filePath: '/project-root/assets/logo.png' },
    output: {
      ok: true,
      data: {
        fileType: 'image',
        base: {
          fileName: 'logo.png',
          mimeType: 'image/png',
          fileSize: 245760,
          modifiedAt: '2026-03-01T08:00:00Z',
          createdAt: '2026-02-15T10:30:00Z',
          filePath: '/project-root/assets/logo.png',
        },
        details: {
          width: 1024,
          height: 1024,
          format: 'png',
          colorSpace: 'srgb',
          channels: 4,
          depth: 8,
          hasAlpha: true,
          density: 72,
          isAnimated: false,
        },
      },
    },
  },
]

// ─── Group 3: Shell/代码 ────────────────────────────────────────────────

const shellCodeParts: ToolShowcasePart[] = [
  {
    type: 'tool-shell-command',
    toolCallId: callId(),
    toolName: 'shell-command',
    state: 'output-available',
    input: { command: 'pnpm run build' },
    output: {
      ok: true,
      data: {
        output: '$ turbo build\n\n• Packages in scope: @openloaf/api, @openloaf/config, @openloaf/db, server, web\n• Running build in 5 packages\n• Remote caching disabled\n\nweb:build: ✓ Compiled successfully\nserver:build: ✓ Build completed in 2.3s\n\n Tasks:    5 successful, 5 total\n Cached:   3 cached, 5 total\n  Time:    8.421s',
        metadata: { exit_code: 0, duration_seconds: 8.421 },
      },
    },
  },
]

// ─── Group 4: 浏览器 ────────────────────────────────────────────────

const browserParts: ToolShowcasePart[] = [
  {
    type: 'tool-OpenUrl',
    toolCallId: callId(),
    toolName: 'OpenUrl',
    state: 'output-available',
    input: { actionName: '打开网页', url: 'https://github.com/OpenLoaf/OpenLoaf' },
    output: { ok: true, data: { url: 'https://github.com/OpenLoaf/OpenLoaf', title: 'OpenLoaf - AI Productivity App' } },
  },
  {
    type: 'tool-BrowserSnapshot',
    toolCallId: callId(),
    toolName: 'BrowserSnapshot',
    state: 'output-available',
    input: { actionName: '获取页面快照' },
    output: {
      ok: true,
      data: {
        url: 'https://github.com/OpenLoaf/OpenLoaf',
        title: 'OpenLoaf/OpenLoaf: AI Productivity Desktop App',
        readyState: 'complete',
        elements: [
          { selector: 'h1', text: 'OpenLoaf', tag: 'h1' },
          { selector: 'nav > a:nth-child(1)', text: 'Code', tag: 'a' },
          { selector: 'nav > a:nth-child(2)', text: 'Issues', tag: 'a' },
          { selector: 'nav > a:nth-child(3)', text: 'Pull requests', tag: 'a' },
          { selector: '.readme p:first-child', text: 'A full-stack AI productivity desktop application', tag: 'p' },
        ],
        text: 'OpenLoaf - AI Productivity Desktop App\n\nA full-stack AI productivity desktop application built with Electron + Next.js.',
      },
    },
  },
  {
    type: 'tool-BrowserObserve',
    toolCallId: callId(),
    toolName: 'BrowserObserve',
    state: 'output-available',
    input: { actionName: '观察页面', task: '查找登录按钮' },
    output: {
      ok: true,
      data: {
        url: 'https://example.com/login',
        title: 'Login Page',
        readyState: 'complete',
        elements: [
          { selector: '#username', text: '', tag: 'input' },
          { selector: '#password', text: '', tag: 'input' },
          { selector: 'button[type=submit]', text: 'Sign In', tag: 'button' },
        ],
      },
    },
  },
  {
    type: 'tool-BrowserScreenshot',
    toolCallId: callId(),
    toolName: 'BrowserScreenshot',
    state: 'output-available',
    input: { actionName: '页面截图' },
    output: {
      ok: true,
      data: {
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        format: 'png',
        bytes: 95,
      },
    },
  },
  {
    type: 'tool-BrowserAct',
    toolCallId: callId(),
    toolName: 'BrowserAct',
    state: 'output-available',
    input: { actionName: '点击按钮', action: 'click', selector: 'button[type=submit]' },
    output: { ok: true, data: { action: 'click', selector: 'button[type=submit]', success: true } },
  },
  {
    type: 'tool-BrowserExtract',
    toolCallId: callId(),
    toolName: 'BrowserExtract',
    state: 'output-available',
    input: { actionName: '提取数据', instruction: '提取所有产品名称和价格' },
    output: {
      ok: true,
      data: {
        extracted: [
          { name: 'OpenLoaf Pro', price: '$99/year' },
          { name: 'OpenLoaf Team', price: '$299/year' },
          { name: 'OpenLoaf Enterprise', price: 'Contact sales' },
        ],
      },
    },
  },
  {
    type: 'tool-BrowserWait',
    toolCallId: callId(),
    toolName: 'BrowserWait',
    state: 'output-available',
    input: { actionName: '等待元素', selector: '.loading-spinner', waitFor: 'hidden', timeout: 5000 },
    output: { ok: true, data: { waited: true, elapsed: 1200 } },
  },
  {
    type: 'tool-BrowserDownloadImage',
    toolCallId: callId(),
    toolName: 'BrowserDownloadImage',
    state: 'output-available',
    input: { actionName: '下载图片', url: 'https://example.com/photo.jpg' },
    output: { ok: true, data: { filePath: '/project-root/downloads/photo.jpg', size: 524288, format: 'jpeg' } },
  },
]

// ─── Group 5: Office ────────────────────────────────────────────────

const officeParts: ToolShowcasePart[] = [
  {
    type: 'tool-ExcelQuery',
    toolCallId: callId(),
    toolName: 'ExcelQuery',
    state: 'output-available',
    input: { action: 'read-sheet', filePath: '/project-root/budget.xlsx', sheetName: 'Q1 Budget' },
    output: {
      ok: true,
      data: {
        rows: [
          ['Category', 'Jan', 'Feb', 'Mar', 'Total'],
          ['Engineering', 50000, 52000, 48000, 150000],
          ['Marketing', 20000, 25000, 22000, 67000],
          ['Operations', 15000, 15500, 16000, 46500],
          ['Total', 85000, 92500, 86000, 263500],
        ],
        offset: 0,
        hasMore: false,
        totalRows: 5,
      },
    },
  },
  {
    type: 'tool-ExcelMutate',
    toolCallId: callId(),
    toolName: 'ExcelMutate',
    state: 'output-available',
    input: {
      action: 'write-cells',
      filePath: '/project-root/budget.xlsx',
      sheetName: 'Q1 Budget',
      range: 'B6:D6',
      data: [[90000, 95000, 88000]],
    },
    output: {
      ok: true,
      data: { cellsWritten: 3, filePath: '/project-root/budget.xlsx' },
    },
  },
  {
    type: 'tool-WordQuery',
    toolCallId: callId(),
    toolName: 'WordQuery',
    state: 'output-available',
    input: { action: 'read-structure', filePath: '/project-root/meeting-notes.docx' },
    output: {
      ok: true,
      data: {
        paragraphs: [
          { index: 0, text: '周会纪要 - 2026年3月9日', style: 'Heading1' },
          { index: 1, text: '参会人员：张三、李四、王五', style: 'Normal' },
          { index: 2, text: '议题一：Q1 复盘', style: 'Heading2' },
          { index: 3, text: '完成了核心功能的开发，用户增长 35%。', style: 'Normal' },
        ],
        tables: [{ index: 0, rows: 3, cols: 4 }],
        images: [],
        totalParagraphs: 4,
        truncated: false,
      },
    },
  },
  {
    type: 'tool-WordMutate',
    toolCallId: callId(),
    toolName: 'WordMutate',
    state: 'output-available',
    input: {
      action: 'edit',
      filePath: '/project-root/meeting-notes.docx',
      edits: [{ type: 'append', content: '议题二：Q2 计划' }],
    },
    output: {
      ok: true,
      data: { action: 'edit', editCount: 1, filePath: '/project-root/meeting-notes.docx' },
    },
  },
  {
    type: 'tool-PptxQuery',
    toolCallId: callId(),
    toolName: 'PptxQuery',
    state: 'output-available',
    input: { action: 'read-structure', filePath: '/project-root/presentation.pptx' },
    output: {
      ok: true,
      data: {
        slides: [
          { index: 0, title: '产品路线图 2026', textBlocks: ['OpenLoaf Team'], layout: 'Title Slide' },
          { index: 1, title: 'Q1 成果', textBlocks: ['用户增长 35%', '功能上线 12 个'], layout: 'Content' },
          { index: 2, title: 'Q2 计划', textBlocks: ['国际化', '移动端', '企业版'], layout: 'Content' },
        ],
        slideCount: 3,
      },
    },
  },
  {
    type: 'tool-PptxMutate',
    toolCallId: callId(),
    toolName: 'PptxMutate',
    state: 'output-available',
    input: {
      action: 'edit',
      filePath: '/project-root/presentation.pptx',
      edits: [{ slideIndex: 2, type: 'add-text', text: '性能优化' }],
    },
    output: {
      ok: true,
      data: { action: 'edit', slideCount: 3, editCount: 1 },
    },
  },
  {
    type: 'tool-PdfQuery',
    toolCallId: callId(),
    toolName: 'PdfQuery',
    state: 'output-available',
    input: { action: 'read-structure', filePath: '/project-root/invoice.pdf' },
    output: {
      ok: true,
      data: {
        pageCount: 2,
        fileSize: 156800,
        hasForm: true,
        formFieldCount: 8,
        metadata: { title: 'Invoice #2026-0309', author: 'OpenLoaf', creator: 'PDF Generator' },
      },
    },
  },
  {
    type: 'tool-PdfMutate',
    toolCallId: callId(),
    toolName: 'PdfMutate',
    state: 'output-available',
    input: {
      action: 'fill-form',
      filePath: '/project-root/invoice.pdf',
      fields: { company: 'OpenLoaf Inc.', amount: '$15,000', date: '2026-03-09' },
    },
    output: {
      ok: true,
      data: { pageCount: 2, filledCount: 3, skippedFields: [] },
    },
  },
]

// ─── Group 6: 媒体/转换 ────────────────────────────────────────────────

const mediaParts: ToolShowcasePart[] = [
  {
    type: 'tool-image-generate',
    toolCallId: callId(),
    toolName: 'image-generate',
    state: 'output-available',
    input: { actionName: '生成图片', prompt: '一只在太空中漂浮的橘猫，背景是星空和地球' },
    output: { ok: true },
  },
  {
    type: 'tool-video-generate',
    toolCallId: callId(),
    toolName: 'video-generate',
    state: 'output-available',
    input: { actionName: '生成视频', prompt: '日出延时摄影，从海平面到金色阳光洒满城市' },
    output: { ok: true },
  },
  {
    type: 'tool-ImageProcess',
    toolCallId: callId(),
    toolName: 'ImageProcess',
    state: 'output-available',
    input: { action: 'get-info', filePath: '/project-root/assets/banner.png' },
    output: {
      ok: true,
      data: {
        action: 'get-info',
        width: 1920,
        height: 1080,
        format: 'png',
        colorSpace: 'srgb',
        channels: 4,
        depth: 8,
        hasAlpha: true,
        fileSize: 2457600,
      },
    },
  },
  {
    type: 'tool-VideoDownload',
    toolCallId: callId(),
    toolName: 'VideoDownload',
    state: 'output-available',
    input: {
      actionName: '下载公开视频',
      url: 'https://example.com/videos/openloaf-demo.mp4',
    },
    output: {
      ok: true,
      data: {
        url: 'https://example.com/videos/openloaf-demo.mp4',
        destination: 'chat',
        fileName: 'openloaf-demo.mp4',
        filePath: '.openloaf/chat-history/session_demo/asset/openloaf-demo.mp4',
        absolutePath: '/project-root/.openloaf/chat-history/session_demo/asset/openloaf-demo.mp4',
        fileSize: 15728640,
        title: 'OpenLoaf Demo Walkthrough',
        duration: 125,
        width: 1280,
        height: 720,
        ext: 'mp4',
        projectId: 'proj_demo',
        sessionId: 'session_demo',
      },
    },
  },
  {
    type: 'tool-VideoConvert',
    toolCallId: callId(),
    toolName: 'VideoConvert',
    state: 'output-available',
    input: { actionName: '视频转换', inputPath: '/project-root/video.mov', outputFormat: 'mp4' },
    output: {
      ok: true,
      data: {
        outputPath: '/project-root/video.mp4',
        duration: 120.5,
        size: 15728640,
      },
    },
  },
  {
    type: 'tool-DocConvert',
    toolCallId: callId(),
    toolName: 'DocConvert',
    state: 'output-available',
    input: { actionName: '文档转换', inputPath: '/project-root/report.docx', outputFormat: 'pdf' },
    output: {
      ok: true,
      data: {
        outputPath: '/project-root/report.pdf',
        pageCount: 5,
        size: 256000,
      },
    },
  },
]

// ─── Group 7: 项目/任务/邮件/日历 ────────────────────────────────────────

const projectTaskEmailParts: ToolShowcasePart[] = [
  {
    type: 'tool-ProjectQuery',
    toolCallId: callId(),
    toolName: 'ProjectQuery',
    state: 'output-available',
    input: { mode: 'list' },
    output: {
      ok: true,
      data: {
        projects: [
          { projectId: 'proj_1', title: 'OpenLoaf Core', icon: '🚀', rootUri: '/project-root/openloaf', parentProjectId: null, depth: 0 },
          { projectId: 'proj_2', title: 'Web Frontend', icon: '🌐', rootUri: '/project-root/openloaf/apps/web', parentProjectId: 'proj_1', depth: 1 },
          { projectId: 'proj_3', title: 'API Server', icon: '⚙️', rootUri: '/project-root/openloaf/apps/server', parentProjectId: 'proj_1', depth: 1 },
          { projectId: 'proj_4', title: 'Documentation', icon: '📖', rootUri: '/project-root/docs', parentProjectId: null, depth: 0 },
        ],
      },
    },
  },
  {
    type: 'tool-ProjectMutate',
    toolCallId: callId(),
    toolName: 'ProjectMutate',
    state: 'output-available',
    input: { actionName: '创建项目', mode: 'create', title: 'Mobile App', icon: '📱', rootUri: '/project-root/mobile' },
    output: {
      ok: true,
      data: {
        project: { projectId: 'proj_5', title: 'Mobile App', icon: '📱', rootUri: '/project-root/mobile' },
      },
    },
  },
  {
    type: 'tool-TaskManage',
    toolCallId: callId(),
    toolName: 'TaskManage',
    state: 'output-available',
    input: {
      action: 'create',
      title: '实现用户登录页面',
      description: '使用 OAuth 2.0 实现 Google/GitHub 登录',
      priority: 'high',
      schedule: { type: 'once', scheduleAt: '2026-03-15T09:00:00Z' },
      agentName: 'coder',
    },
    output: {
      ok: true,
      data: {
        taskId: 'task_001',
        task: { id: 'task_001', name: '实现用户登录页面', status: 'todo' },
        message: '任务已创建',
      },
    },
  },
  {
    type: 'tool-TaskStatus',
    toolCallId: callId(),
    toolName: 'TaskStatus',
    state: 'output-available',
    input: { actionName: '查看任务状态', taskId: 'task_001' },
    output: {
      ok: true,
      data: {
        taskId: 'task_001',
        task: { id: 'task_001', name: '实现用户登录页面', status: 'running' },
        newStatus: 'running',
      },
    },
  },
  {
    type: 'tool-CalendarQuery',
    toolCallId: callId(),
    toolName: 'CalendarQuery',
    state: 'output-available',
    input: { actionName: '查询日历', mode: 'list-events', startDate: '2026-03-09', endDate: '2026-03-15' },
    output: {
      ok: true,
      data: {
        events: [
          { id: 'evt_1', title: '周一站会', start: '2026-03-09T09:00:00', end: '2026-03-09T09:30:00', allDay: false },
          { id: 'evt_2', title: '产品评审', start: '2026-03-11T14:00:00', end: '2026-03-11T15:30:00', allDay: false },
          { id: 'evt_3', title: 'Sprint 回顾', start: '2026-03-14T16:00:00', end: '2026-03-14T17:00:00', allDay: false },
        ],
      },
    },
  },
  {
    type: 'tool-EmailQuery',
    toolCallId: callId(),
    toolName: 'EmailQuery',
    state: 'output-available',
    input: { mode: 'list-messages', accountId: 'acc_1', mailbox: 'INBOX', limit: 5 },
    output: {
      ok: true,
      data: {
        items: [
          { id: 'mail_1', from: 'alice@example.com', subject: 'Q2 预算审批', preview: '请审阅附件中的 Q2 预算方案...', time: '2026-03-09T08:15:00Z', unread: true, hasAttachments: true },
          { id: 'mail_2', from: 'bob@example.com', subject: 'Re: API 设计讨论', preview: '同意你的方案，我补充了几点...', time: '2026-03-08T16:42:00Z', unread: true, hasAttachments: false },
          { id: 'mail_3', from: 'ci@github.com', subject: '[OpenLoaf] Build passed ✓', preview: 'All checks have passed on main...', time: '2026-03-08T14:20:00Z', unread: false, hasAttachments: false },
          { id: 'mail_4', from: 'hr@company.com', subject: '三月团建活动通知', preview: '各位同事，三月团建定在3月22日...', time: '2026-03-07T10:00:00Z', unread: false, hasAttachments: true },
          { id: 'mail_5', from: 'noreply@slack.com', subject: 'Slack notification digest', preview: 'You have 12 unread messages...', time: '2026-03-07T08:00:00Z', unread: false, hasAttachments: false },
        ],
        nextCursor: 'cursor_page2',
      },
    },
  },
]

// ─── Group 8: UI/Widget ────────────────────────────────────────────────

const uiWidgetParts: ToolShowcasePart[] = [
  {
    type: 'tool-JsxCreate',
    toolCallId: callId(),
    toolName: 'JsxCreate',
    state: 'output-available',
    input: {
      content: '<div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">\n  <h2 className="text-lg font-semibold">Hello OpenLoaf</h2>\n  <p>This is a JSX preview component.</p>\n</div>',
    },
    output: { ok: true },
  },
  {
    type: 'tool-ChartRender',
    toolCallId: callId(),
    toolName: 'ChartRender',
    state: 'output-available',
    input: {
      title: '月度用户增长',
      height: 300,
      option: {
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
        yAxis: { type: 'value' },
        series: [{
          data: [820, 932, 1105, 1280, 1450, 1680],
          type: 'line',
          smooth: true,
        }],
      },
    },
    output: { ok: true, data: { rawOption: {} } },
  },
  {
    type: 'tool-GenerateWidget',
    toolCallId: callId(),
    toolName: 'GenerateWidget',
    state: 'output-available',
    input: {
      widgetId: 'widget_clock',
      widgetName: 'Digital Clock',
      widgetTsx: 'export default function Clock() { return <div>12:30:00</div> }',
    },
    output: { ok: true, data: { widgetId: 'widget_clock', widgetName: 'Digital Clock' } },
  },
  {
    type: 'tool-WidgetInit',
    toolCallId: callId(),
    toolName: 'WidgetInit',
    state: 'output-available',
    input: { widgetName: 'Weather Dashboard' },
    output: {
      ok: true,
      data: {
        widgetId: 'widget_weather',
        widgetDir: '/project-root/.openloaf/widgets/widget_weather',
        files: ['index.tsx', 'style.css', 'manifest.json'],
      },
    },
  },
  {
    type: 'tool-WidgetCheck',
    toolCallId: callId(),
    toolName: 'WidgetCheck',
    state: 'output-available',
    input: { widgetId: 'widget_clock' },
    output: {
      ok: true,
      data: { ok: true, widgetId: 'widget_clock', widgetName: 'Digital Clock', errors: [] },
    },
  },
  {
    type: 'tool-WidgetList',
    toolCallId: callId(),
    toolName: 'WidgetList',
    state: 'output-available',
    input: { actionName: '列出小组件' },
    output: {
      ok: true,
      data: {
        widgets: [
          { id: 'widget_clock', name: 'Digital Clock', status: 'ready' },
          { id: 'widget_weather', name: 'Weather Dashboard', status: 'building' },
        ],
      },
    },
  },
  {
    type: 'tool-WidgetGet',
    toolCallId: callId(),
    toolName: 'WidgetGet',
    state: 'output-available',
    input: { actionName: '获取小组件', widgetId: 'widget_clock' },
    output: {
      ok: true,
      data: {
        widgetId: 'widget_clock',
        widgetName: 'Digital Clock',
        status: 'ready',
        files: ['index.tsx', 'style.css'],
      },
    },
  },
  {
    type: 'tool-AskUserQuestion',
    toolCallId: callId(),
    toolName: 'AskUserQuestion',
    state: 'output-available',
    input: {
      actionName: '收集配置信息',
      mode: 'form',
      questions: [
        { key: 'api_key', label: 'API Key', type: 'text', required: true },
        { key: 'region', label: '区域', type: 'select', options: ['cn-east', 'cn-north', 'us-west'], required: true },
        { key: 'enable_cache', label: '启用缓存', type: 'boolean', required: false },
      ],
    },
    output: {
      ok: true,
      data: {
        answers: { api_key: 'sk-demo-12345', region: 'cn-east', enable_cache: true },
      },
    },
  },
  {
    type: 'tool-EditDocument',
    toolCallId: callId(),
    toolName: 'EditDocument',
    state: 'output-available',
    input: { actionName: '编辑文档', documentId: 'doc_1', content: '# Updated Title\n\nNew content here.' },
    output: { ok: true, data: { documentId: 'doc_1', saved: true } },
  },
]

// ─── Export all groups ────────────────────────────────────────────────

export const TOOL_SHOWCASE_GROUPS: ToolShowcaseGroup[] = [
  { label: '系统/Agent 工具', parts: systemAgentParts },
  { label: '文件操作工具', parts: fileOpParts },
  { label: 'Shell/代码工具', parts: shellCodeParts },
  { label: '浏览器工具', parts: browserParts },
  { label: 'Office 文档工具', parts: officeParts },
  { label: '媒体/转换工具', parts: mediaParts },
  { label: '项目/任务/邮件/日历工具', parts: projectTaskEmailParts },
  { label: 'UI/Widget 工具', parts: uiWidgetParts },
]

/** Flat list of all tool parts for iteration. */
export const ALL_TOOL_PARTS = TOOL_SHOWCASE_GROUPS.flatMap((g) => g.parts)

/**
 * Build JSONL messages array for the showcase session.
 * Returns array of message objects (not yet stringified).
 */
export function buildShowcaseMessages() {
  const messages: Record<string, unknown>[] = []
  const baseTime = new Date('2026-03-09T10:00:00+08:00')
  let prevId: string | null = null

  for (let gi = 0; gi < TOOL_SHOWCASE_GROUPS.length; gi++) {
    const group = TOOL_SHOWCASE_GROUPS[gi]
    const userTime = new Date(baseTime.getTime() + gi * 120_000)
    const asstTime = new Date(userTime.getTime() + 5_000)

    const userId = `user-showcase-${gi + 1}`
    const asstId = `asst-showcase-${gi + 1}`

    // User message
    messages.push({
      id: userId,
      parentMessageId: prevId,
      role: 'user',
      messageKind: 'normal',
      parts: [{ type: 'text', text: group.label }],
      createdAt: userTime.toISOString(),
    })

    // Assistant message with all tool parts + trailing text
    const asstParts: Record<string, unknown>[] = group.parts.map((p) => ({
      type: p.type,
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      state: p.state,
      input: p.input,
      output: p.output,
    }))
    asstParts.push({ type: 'text', text: `✓ ${group.label} 展示完成`, state: 'done' })

    messages.push({
      id: asstId,
      parentMessageId: userId,
      role: 'assistant',
      messageKind: 'normal',
      parts: asstParts,
      metadata: {},
      createdAt: asstTime.toISOString(),
    })

    prevId = asstId
  }

  return messages
}
