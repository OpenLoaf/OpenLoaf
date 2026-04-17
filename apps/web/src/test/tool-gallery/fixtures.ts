/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

// ⚠️ 这份 fixture 与 TOOL_REGISTRY 一一对应：
//   apps/web/src/components/ai/message/tools/tool-registry.ts
//
// 每条 TOOL_REGISTRY entry 至少要有一条对应的 ToolFixture（成功态）。
// 新增工具 UI / 修改 input/output schema 时必须同步更新这里，否则「设置 →
// 测试 → AI Tool UI Gallery」预览与真实对话脱节。详见项目规则
// feedback_tool_ui_gallery_sync。

import type { AnyToolPart } from '@/components/ai/message/tools/shared/tool-utils'

export type ToolFixture = {
  id: string
  title: string
  toolKind: string
  providerExecuted?: boolean
  part: AnyToolPart
}

export type ToolFixtureGroup = {
  key: string
  label: string
  description?: string
  fixtures: ToolFixture[]
}

// Helpers -------------------------------------------------------------

const SAMPLE_IMAGE = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=640'

function makePart(partial: Partial<AnyToolPart> & { toolKind: string; suffix: string; providerExecuted?: boolean }): AnyToolPart {
  const { toolKind, suffix, providerExecuted, ...rest } = partial
  return {
    type: `tool-${toolKind}`,
    toolName: toolKind,
    toolCallId: `gallery-${toolKind}-${suffix}`,
    state: 'output-available',
    providerExecuted,
    ...rest,
  } as AnyToolPart
}

// Claude Code CLI (providerExecuted) ----------------------------------

const cliBashFixtures: ToolFixture[] = [
  {
    id: 'bash-success',
    title: '执行成功',
    toolKind: 'bash',
    providerExecuted: true,
    part: makePart({
      toolKind: 'bash',
      suffix: 'ok',
      providerExecuted: true,
      input: { command: 'pnpm run check-types', description: 'Run type check' },
      output: 'tsc --noEmit\n\nFound 0 errors.\n',
    }),
  },
  {
    id: 'bash-streaming',
    title: '流式执行中',
    toolKind: 'bash',
    providerExecuted: true,
    part: makePart({
      toolKind: 'bash',
      suffix: 'streaming',
      providerExecuted: true,
      state: 'output-streaming',
      input: { command: 'pnpm run build', description: 'Build app' },
      output: '> turbo run build\n\n@openloaf/web:build: Creating optimized production build...',
    }),
  },
  {
    id: 'bash-error',
    title: '执行失败',
    toolKind: 'bash',
    providerExecuted: true,
    part: makePart({
      toolKind: 'bash',
      suffix: 'err',
      providerExecuted: true,
      state: 'output-error',
      input: { command: 'npm run missing-script' },
      errorText: "npm error Missing script: 'missing-script'\nnpm error\nnpm error Did you mean one of these?\nnpm error   npm run build",
    }),
  },
]

const cliReadFixtures: ToolFixture[] = [
  {
    id: 'read-text',
    title: '读取文本文件',
    toolKind: 'read',
    providerExecuted: true,
    part: makePart({
      toolKind: 'read',
      suffix: 'text',
      providerExecuted: true,
      input: { file_path: '/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/package.json' },
      output: '     1\t{\n     2\t  "name": "openloaf",\n     3\t  "version": "0.0.1",\n     4\t  "private": true\n     5\t}',
    }),
  },
]

const cliWriteFixtures: ToolFixture[] = [
  {
    id: 'write-new',
    title: '写入新文件',
    toolKind: 'write',
    providerExecuted: true,
    part: makePart({
      toolKind: 'write',
      suffix: 'new',
      providerExecuted: true,
      input: {
        file_path: '/tmp/hello.ts',
        content: "export function hello(name: string): string {\n  return `Hello, ${name}!`\n}\n",
      },
      output: 'File created successfully at /tmp/hello.ts',
    }),
  },
]

const cliEditFixtures: ToolFixture[] = [
  {
    id: 'edit-single',
    title: '单处替换',
    toolKind: 'edit',
    providerExecuted: true,
    part: makePart({
      toolKind: 'edit',
      suffix: 'single',
      providerExecuted: true,
      input: {
        file_path: '/tmp/hello.ts',
        old_string: 'Hello, ${name}',
        new_string: 'Hi, ${name}',
      },
      output: 'Applied 1 edit to /tmp/hello.ts',
    }),
  },
]

const cliSearchFixtures: ToolFixture[] = [
  {
    id: 'glob',
    title: 'Glob 搜索',
    toolKind: 'glob',
    providerExecuted: true,
    part: makePart({
      toolKind: 'glob',
      suffix: 'glob',
      providerExecuted: true,
      input: { pattern: '**/*.tsx', path: 'apps/web/src/components/ai' },
      output: 'apps/web/src/components/ai/message/MessageList.tsx\napps/web/src/components/ai/message/MessageItem.tsx\napps/web/src/components/ai/message/MessageThinking.tsx',
    }),
  },
  {
    id: 'grep',
    title: 'Grep 搜索',
    toolKind: 'grep',
    providerExecuted: true,
    part: makePart({
      toolKind: 'grep',
      suffix: 'grep',
      providerExecuted: true,
      input: { pattern: 'TOOL_REGISTRY', path: 'apps/web/src' },
      output: 'apps/web/src/components/ai/message/tools/tool-registry.ts:84:export const TOOL_REGISTRY: ToolRegistryEntry[] = [',
    }),
  },
]

const cliWebFixtures: ToolFixture[] = [
  {
    id: 'webfetch',
    title: 'WebFetch',
    toolKind: 'webfetch',
    providerExecuted: true,
    part: makePart({
      toolKind: 'webfetch',
      suffix: 'fetch',
      providerExecuted: true,
      input: { url: 'https://example.com/docs', prompt: '提取页面主要内容' },
      output: '# Example Domain\n\nThis domain is for illustrative examples in documents.',
    }),
  },
]

const cliWebSearchFixtures: ToolFixture[] = [
  {
    id: 'websearch-cli',
    title: 'WebSearch（CLI）',
    toolKind: 'websearch',
    providerExecuted: true,
    part: makePart({
      toolKind: 'websearch',
      suffix: 'cli',
      providerExecuted: true,
      input: { query: 'Next.js 16 partial prerendering' },
      output: [
        { title: 'Partial Prerendering — Next.js', url: 'https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering' },
        { title: 'Next.js 16 Release Notes', url: 'https://nextjs.org/blog/next-16' },
      ],
    }),
  },
]

const cliTaskFixtures: ToolFixture[] = [
  {
    id: 'task-running',
    title: '子 Agent 运行中',
    toolKind: 'task',
    providerExecuted: true,
    part: makePart({
      toolKind: 'task',
      suffix: 'task',
      providerExecuted: true,
      state: 'output-streaming',
      input: {
        description: 'Explore payment module',
        prompt: 'Investigate how refunds are handled in the payment service',
        subagent_type: 'Explore',
      },
      output: 'Starting Explore subagent…\nReading apps/server/src/routers/payment.ts…',
    }),
  },
]

// Standard tools ------------------------------------------------------

const planFixtures: ToolFixture[] = [
  {
    id: 'plan-approval',
    title: '等待审批',
    toolKind: 'SubmitPlan',
    part: makePart({
      toolKind: 'SubmitPlan',
      suffix: 'approval',
      state: 'approval-requested',
      input: {
        plan: '# 计划\n\n1. 创建 `/test-tools` 路由\n2. 编写 fixtures\n3. Mock Chat context\n4. 在浏览器中验证',
      },
      approval: { id: 'appr-plan-1' },
    }),
  },
  {
    id: 'plan-approved',
    title: '已同意',
    toolKind: 'SubmitPlan',
    part: makePart({
      toolKind: 'SubmitPlan',
      suffix: 'approved',
      state: 'output-available',
      input: { plan: '# 计划\n\n1. 完成实现' },
      approval: { id: 'appr-plan-2', approved: true },
      output: 'Plan approved',
    }),
  },
]

const askUserFixtures: ToolFixture[] = [
  {
    id: 'ask-user-choice-single',
    title: '单选（choice 模式）',
    toolKind: 'AskUserQuestion',
    part: makePart({
      toolKind: 'AskUserQuestion',
      suffix: 'choice-single',
      state: 'approval-requested',
      input: {
        title: '要启用增量更新吗？',
        description: '启用后每次启动会自动检查并下载小补丁。',
        mode: 'choice',
        choices: [
          {
            key: 'incremental',
            question: '增量更新',
            options: [
              { label: '启用', description: '自动下载并应用小补丁' },
              { label: '跳过', description: '暂时保持当前版本' },
              { label: '稍后提醒', description: '下次启动时再问我' },
            ],
          },
        ],
      },
      approval: { id: 'appr-ask-single' },
    }),
  },
  {
    id: 'ask-user-choice-multi',
    title: '多选（choice 模式）',
    toolKind: 'AskUserQuestion',
    part: makePart({
      toolKind: 'AskUserQuestion',
      suffix: 'choice-multi',
      state: 'approval-requested',
      input: {
        title: '选择要安装的技能',
        description: '可以多选，点击右下角"确定"提交。',
        mode: 'choice',
        choices: [
          {
            key: 'skills',
            question: '技能列表',
            multiSelect: true,
            options: [
              { label: 'git-workflow', description: '提交、PR、代码审查流程' },
              { label: 'canvas-design', description: '生成海报/视觉设计' },
              { label: 'chrome-perf-analyzer', description: '分析 Chrome DevTools trace' },
              { label: 'command-analysis-rules', description: '命令结果分析规则' },
            ],
          },
        ],
      },
      approval: { id: 'appr-ask-multi' },
    }),
  },
  {
    id: 'ask-user-form',
    title: '表单（form 模式）',
    toolKind: 'AskUserQuestion',
    part: makePart({
      toolKind: 'AskUserQuestion',
      suffix: 'form',
      state: 'approval-requested',
      input: {
        title: '配置项目',
        description: '请填写以下信息完成初始化。',
        mode: 'form',
        questions: [
          {
            key: 'name',
            label: '项目名称',
            type: 'text',
            required: true,
            placeholder: 'my-awesome-app',
            minLength: 2,
            maxLength: 40,
          },
          {
            key: 'framework',
            label: '框架',
            type: 'select',
            options: ['Next.js', 'Remix', 'Astro', 'SvelteKit'],
            defaultValue: 'Next.js',
          },
          {
            key: 'apiKey',
            label: 'API Key',
            type: 'secret',
            required: true,
            placeholder: 'sk-...',
          },
          {
            key: 'notes',
            label: '备注',
            type: 'textarea',
            required: false,
            placeholder: '项目描述 / 特殊约束…',
            maxLength: 200,
          },
        ],
      },
      approval: { id: 'appr-ask-form' },
    }),
  },
]

const shellFixtures: ToolFixture[] = [
  {
    id: 'shell-success',
    title: '执行成功',
    toolKind: 'Bash',
    part: makePart({
      toolKind: 'Bash',
      suffix: 'ok',
      input: { command: 'git status --short' },
      output: JSON.stringify({
        output: ' M apps/web/src/components/ai/message/tools/tool-registry.ts\n?? apps/web/src/test/tool-gallery/',
        metadata: { exit_code: 0, duration_seconds: 0.12 },
      }),
    }),
  },
  {
    id: 'shell-approval',
    title: '待审批',
    toolKind: 'Bash',
    part: makePart({
      toolKind: 'Bash',
      suffix: 'approval',
      state: 'approval-requested',
      input: { command: 'rm -rf node_modules' },
      approval: { id: 'appr-shell-1' },
    }),
  },
  {
    id: 'shell-error',
    title: '执行失败',
    toolKind: 'Bash',
    part: makePart({
      toolKind: 'Bash',
      suffix: 'err',
      state: 'output-error',
      input: { command: 'pnpm run build' },
      errorText: 'Error: Cannot find module "missing-lib"\n    at require (node:internal/modules/cjs/loader:1024:15)',
    }),
  },
]

const readFileFixtures: ToolFixture[] = [
  {
    id: 'read-file',
    title: '读取文本',
    toolKind: 'Read',
    part: makePart({
      toolKind: 'Read',
      suffix: 'text',
      input: { file_path: '/Users/demo/README.md' },
      output: '# Demo\n\n项目说明文件。\n',
    }),
  },
]

const grepFixtures: ToolFixture[] = [
  {
    id: 'grep-files',
    title: '关键字命中',
    toolKind: 'Grep',
    part: makePart({
      toolKind: 'Grep',
      suffix: 'match',
      input: { pattern: 'useChatTools', path: 'apps/web/src' },
      output: JSON.stringify({
        matches: [
          { file: 'apps/web/src/components/ai/message/MessageList.tsx', line: 13, text: "import { useChatMessages, useChatStatus, useChatTools } from \"../context\";" },
          { file: 'apps/web/src/components/ai/message/tools/MessageTool.tsx', line: 14, text: 'import { useChatStatus, useChatTools } from "../../context";' },
        ],
      }),
    }),
  },
]

const globFixtures: ToolFixture[] = [
  {
    id: 'glob-list',
    title: '文件列表',
    toolKind: 'Glob',
    part: makePart({
      toolKind: 'Glob',
      suffix: 'list',
      input: { pattern: 'apps/web/src/**/*.tsx' },
      output: 'apps/web/src/app/page.tsx\napps/web/src/app/layout.tsx\napps/web/src/components/ai/ChatHeader.tsx',
    }),
  },
]

const writeFileFixtures: ToolFixture[] = [
  {
    id: 'apply-patch',
    title: '补丁应用',
    toolKind: 'apply-patch',
    part: makePart({
      toolKind: 'apply-patch',
      suffix: 'patch',
      input: {
        file_path: '/tmp/foo.ts',
        old_string: 'const x = 1',
        new_string: 'const x = 2',
      },
      output: 'Patch applied',
    }),
  },
]

const docPreviewFixtures: ToolFixture[] = [
  {
    id: 'doc-preview',
    title: '文档预览',
    toolKind: 'DocPreview',
    part: makePart({
      toolKind: 'DocPreview',
      suffix: 'pdf',
      input: { file_path: '/Users/demo/report.pdf', pages: '1-3' },
      output: '已加载 3 页，总字数 1,284。',
    }),
  },
]

const widgetFixtures: ToolFixture[] = [
  {
    id: 'widget-generate',
    title: '生成 Widget',
    toolKind: 'GenerateWidget',
    part: makePart({
      toolKind: 'GenerateWidget',
      suffix: 'gen',
      input: { name: 'ClockCard', description: '显示本地时间的小部件' },
      output: JSON.stringify({ ok: true, widgetId: 'widget-clock-card' }),
    }),
  },
  {
    id: 'widget-init',
    title: '初始化 Widget 项目',
    toolKind: 'WidgetInit',
    part: makePart({
      toolKind: 'WidgetInit',
      suffix: 'init',
      input: { name: 'ClockCard' },
      output: '初始化完成',
    }),
  },
  {
    id: 'widget-check',
    title: 'Widget 校验',
    toolKind: 'WidgetCheck',
    part: makePart({
      toolKind: 'WidgetCheck',
      suffix: 'check',
      input: {},
      output: JSON.stringify({ newWidgets: ['ClockCard'], errors: [] }),
    }),
  },
]

const agentFixtures: ToolFixture[] = [
  {
    id: 'agent-running',
    title: '子 Agent 运行中',
    toolKind: 'Agent',
    part: makePart({
      toolKind: 'Agent',
      suffix: 'running',
      state: 'output-streaming',
      input: {
        description: 'Audit security',
        prompt: '审查 auth 模块里的 token 处理是否有泄露风险',
        subagent_type: 'plan-critic-security',
      },
      output: 'SubAgent 正在执行...',
    }),
  },
]

const sendMessageFixtures: ToolFixture[] = [
  {
    id: 'send-message',
    title: '向队友发消息',
    toolKind: 'SendMessage',
    part: makePart({
      toolKind: 'SendMessage',
      suffix: 'send',
      input: { to: 'frontend-dev', message: '开始开发 /test-tools 页面' },
      output: 'Message delivered',
    }),
  },
]

const chartFixtures: ToolFixture[] = [
  {
    id: 'chart-render',
    title: '渲染图表',
    toolKind: 'ChartRender',
    part: makePart({
      toolKind: 'ChartRender',
      suffix: 'pie',
      input: {
        type: 'pie',
        title: '用户构成',
        data: [
          { label: 'Office', value: 45 },
          { label: 'Geek', value: 30 },
          { label: 'Newbie', value: 25 },
        ],
      },
      output: JSON.stringify({ ok: true }),
    }),
  },
]

const officeFixtures: ToolFixture[] = [
  {
    id: 'excel-mutate',
    title: 'Excel 生成',
    toolKind: 'ExcelMutate',
    part: makePart({
      toolKind: 'ExcelMutate',
      suffix: 'gen',
      input: { action: 'create', file_path: '/tmp/sales.xlsx' },
      output: JSON.stringify({ ok: true, path: '/tmp/sales.xlsx', rows: 128 }),
    }),
  },
  {
    id: 'word-mutate',
    title: 'Word 生成',
    toolKind: 'WordMutate',
    part: makePart({
      toolKind: 'WordMutate',
      suffix: 'gen',
      input: { action: 'create', file_path: '/tmp/report.docx' },
      output: JSON.stringify({ ok: true, path: '/tmp/report.docx' }),
    }),
  },
  {
    id: 'pptx-mutate',
    title: 'PPT 生成',
    toolKind: 'PptxMutate',
    part: makePart({
      toolKind: 'PptxMutate',
      suffix: 'gen',
      input: { action: 'create', file_path: '/tmp/deck.pptx' },
      output: JSON.stringify({ ok: true, path: '/tmp/deck.pptx', slides: 12 }),
    }),
  },
  {
    id: 'pdf-mutate',
    title: 'PDF 生成',
    toolKind: 'PdfMutate',
    part: makePart({
      toolKind: 'PdfMutate',
      suffix: 'gen',
      input: { action: 'create', file_path: '/tmp/report.pdf' },
      output: JSON.stringify({ ok: true, path: '/tmp/report.pdf' }),
    }),
  },
]

const imageProcessFixtures: ToolFixture[] = [
  {
    id: 'image-process',
    title: '图片处理',
    toolKind: 'ImageProcess',
    part: makePart({
      toolKind: 'ImageProcess',
      suffix: 'resize',
      input: { action: 'resize', file_path: '/tmp/input.jpg', width: 800 },
      output: JSON.stringify({ ok: true, outputPath: '/tmp/output.jpg' }),
    }),
  },
]

const videoFixtures: ToolFixture[] = [
  {
    id: 'video-download',
    title: '视频下载',
    toolKind: 'VideoDownload',
    part: makePart({
      toolKind: 'VideoDownload',
      suffix: 'dl',
      input: { url: 'https://example.com/video.mp4' },
      output: JSON.stringify({ ok: true, filePath: '/tmp/video.mp4', sizeBytes: 2_457_600 }),
    }),
  },
]

const openUrlFixtures: ToolFixture[] = [
  {
    id: 'open-url',
    title: '打开 URL',
    toolKind: 'OpenUrl',
    part: makePart({
      toolKind: 'OpenUrl',
      suffix: 'url',
      input: { url: 'https://openloaf.com', reason: '查看产品主页' },
      output: 'Opened in built-in browser',
    }),
  },
]

const browserFixtures: ToolFixture[] = [
  {
    id: 'browser-snapshot',
    title: '浏览器快照',
    toolKind: 'BrowserSnapshot',
    part: makePart({
      toolKind: 'BrowserSnapshot',
      suffix: 'snap',
      input: { url: 'https://openloaf.com' },
      output: JSON.stringify({
        url: 'https://openloaf.com',
        title: 'OpenLoaf — AI 生产力平台',
        screenshot: SAMPLE_IMAGE,
      }),
    }),
  },
  {
    id: 'browser-act',
    title: '浏览器交互',
    toolKind: 'BrowserAct',
    part: makePart({
      toolKind: 'BrowserAct',
      suffix: 'click',
      input: { action: 'click', selector: '[data-testid="login"]' },
      output: 'Clicked element',
    }),
  },
]

const jobsFixtures: ToolFixture[] = [
  {
    id: 'jobs-list',
    title: '后台任务列表',
    toolKind: 'Jobs',
    part: makePart({
      toolKind: 'Jobs',
      suffix: 'list',
      input: {},
      output: JSON.stringify({
        jobs: [
          { id: 'openloaf-sh-a1b2c3', kind: 'shell', status: 'running', command: 'pnpm run dev' },
          { id: 'openloaf-bg-d4e5f6', kind: 'background', status: 'done' },
        ],
      }),
    }),
  },
]

const sleepFixtures: ToolFixture[] = [
  {
    id: 'sleep',
    title: '等待',
    toolKind: 'Sleep',
    part: makePart({
      toolKind: 'Sleep',
      suffix: 's',
      input: { seconds: 3 },
      output: 'Slept for 3s',
    }),
  },
]

const loadSkillFixtures: ToolFixture[] = [
  {
    id: 'load-skill',
    title: '加载 Skill',
    toolKind: 'LoadSkill',
    part: makePart({
      toolKind: 'LoadSkill',
      suffix: 'load',
      input: { name: 'git-workflow' },
      output: 'Loaded skill: git-workflow',
    }),
  },
]

const scheduledFixtures: ToolFixture[] = [
  {
    id: 'scheduled',
    title: '定时任务管理',
    toolKind: 'ScheduledTaskManage',
    part: makePart({
      toolKind: 'ScheduledTaskManage',
      suffix: 'list',
      input: { action: 'list' },
      output: JSON.stringify({
        tasks: [
          { id: 'task-1', cron: '0 9 * * *', prompt: '每天早晨汇总新闻' },
        ],
      }),
    }),
  },
]

const projectFixtures: ToolFixture[] = [
  {
    id: 'project-mutate',
    title: '项目变更',
    toolKind: 'ProjectMutate',
    part: makePart({
      toolKind: 'ProjectMutate',
      suffix: 'rename',
      input: { action: 'rename', projectId: 'proj-1', name: '新项目名' },
      output: JSON.stringify({ ok: true }),
    }),
  },
]

const fileInfoFixtures: ToolFixture[] = [
  {
    id: 'file-info',
    title: '文件信息',
    toolKind: 'FileInfo',
    part: makePart({
      toolKind: 'FileInfo',
      suffix: 'info',
      input: { file_path: '/tmp/report.pdf' },
      output: JSON.stringify({ ok: true, size: 204800, mimeType: 'application/pdf', pages: 12 }),
    }),
  },
]

const webFetchFixtures: ToolFixture[] = [
  {
    id: 'webfetch-standard',
    title: 'WebFetch（标准）',
    toolKind: 'WebFetch',
    part: makePart({
      toolKind: 'WebFetch',
      suffix: 'standard',
      input: { url: 'https://openloaf.com/docs', prompt: '抓取文档首页' },
      output: '# OpenLoaf Docs\n\n欢迎使用 OpenLoaf。',
    }),
  },
]

const webSearchFixtures: ToolFixture[] = [
  {
    id: 'web-search',
    title: 'WebSearch',
    toolKind: 'WebSearch',
    part: makePart({
      toolKind: 'WebSearch',
      suffix: 'search',
      input: { query: 'React 19 useActionState' },
      output: JSON.stringify({
        results: [
          { title: 'useActionState — React', url: 'https://react.dev/reference/react/useActionState', snippet: 'Hook for action state management.' },
          { title: 'Upgrading to React 19', url: 'https://react.dev/blog/2024/12/05/react-19', snippet: 'New hooks and improvements.' },
        ],
      }),
    }),
  },
  {
    id: 'web-search-image',
    title: 'WebSearchImage',
    toolKind: 'WebSearchImage',
    part: makePart({
      toolKind: 'WebSearchImage',
      suffix: 'img',
      input: { query: 'cozy coffee shop' },
      output: JSON.stringify({
        images: [
          { url: SAMPLE_IMAGE, thumbnailUrl: SAMPLE_IMAGE, title: 'Coffee shop ambient' },
        ],
      }),
    }),
  },
]

const toolSearchFixtures: ToolFixture[] = [
  {
    id: 'tool-search',
    title: '工具搜索',
    toolKind: 'ToolSearch',
    part: makePart({
      toolKind: 'ToolSearch',
      suffix: 'search',
      input: { query: 'pdf merge' },
      output: JSON.stringify({
        tools: [
          { name: 'PdfMutate', description: '创建、合并、拆分、加水印 PDF' },
        ],
      }),
    }),
  },
]

// Cloud ---------------------------------------------------------------

const cloudGenerateFixtures: ToolFixture[] = [
  {
    id: 'cloud-image-generate',
    title: '云端图片生成',
    toolKind: 'CloudImageGenerate',
    part: makePart({
      toolKind: 'CloudImageGenerate',
      suffix: 'img',
      input: { prompt: '工业风极简风格的咖啡机', size: '1024x1024' },
      output: JSON.stringify({
        files: [{ url: SAMPLE_IMAGE, kind: 'image', path: '/tmp/out.png' }],
      }),
    }),
  },
  {
    id: 'cloud-image-edit',
    title: '云端图片编辑',
    toolKind: 'CloudImageEdit',
    part: makePart({
      toolKind: 'CloudImageEdit',
      suffix: 'edit',
      input: { prompt: '把天空换成紫色', imageUrl: SAMPLE_IMAGE },
      output: JSON.stringify({
        files: [{ url: SAMPLE_IMAGE, kind: 'image' }],
      }),
    }),
  },
  {
    id: 'cloud-video-generate',
    title: '云端视频生成',
    toolKind: 'CloudVideoGenerate',
    part: makePart({
      toolKind: 'CloudVideoGenerate',
      suffix: 'vid',
      state: 'output-streaming',
      input: { prompt: '海边日出延时摄影' },
      mediaGenerate: { status: 'generating', kind: 'video', prompt: '海边日出延时摄影', progress: 45 },
      output: JSON.stringify({ pendingUrls: [] }),
    }),
  },
  {
    id: 'cloud-tts',
    title: '云端 TTS',
    toolKind: 'CloudTTS',
    part: makePart({
      toolKind: 'CloudTTS',
      suffix: 'tts',
      input: { text: '欢迎使用 OpenLoaf', voice: 'default' },
      output: JSON.stringify({
        files: [{ url: 'https://example.com/tts.mp3', kind: 'audio' }],
      }),
    }),
  },
]

const cloudLoginFixtures: ToolFixture[] = [
  {
    id: 'cloud-login',
    title: '云端登录',
    toolKind: 'CloudLogin',
    part: makePart({
      toolKind: 'CloudLogin',
      suffix: 'login',
      input: {},
      output: JSON.stringify({ needLogin: true, loginUrl: 'https://openloaf.com/login' }),
    }),
  },
]

const cloudUserInfoFixtures: ToolFixture[] = [
  {
    id: 'cloud-user-info',
    title: '云端用户信息',
    toolKind: 'CloudUserInfo',
    part: makePart({
      toolKind: 'CloudUserInfo',
      suffix: 'info',
      input: {},
      output: JSON.stringify({
        user: { id: 'u_123', email: 'demo@openloaf.com', nickname: 'Demo' },
        credits: { balance: 12480, currency: 'OL' },
      }),
    }),
  },
]

// Groups --------------------------------------------------------------

export const TOOL_FIXTURE_GROUPS: ToolFixtureGroup[] = [
  {
    key: 'cli',
    label: 'Claude Code CLI 工具',
    description: 'providerExecuted=true，由内置 Claude Code runtime 执行',
    fixtures: [
      ...cliBashFixtures,
      ...cliReadFixtures,
      ...cliWriteFixtures,
      ...cliEditFixtures,
      ...cliSearchFixtures,
      ...cliWebFixtures,
      ...cliWebSearchFixtures,
      ...cliTaskFixtures,
    ],
  },
  {
    key: 'approval',
    label: '审批 / 交互类',
    fixtures: [...planFixtures, ...askUserFixtures],
  },
  {
    key: 'shell',
    label: 'Shell / 文件系统',
    fixtures: [
      ...shellFixtures,
      ...readFileFixtures,
      ...grepFixtures,
      ...globFixtures,
      ...writeFileFixtures,
      ...fileInfoFixtures,
      ...docPreviewFixtures,
    ],
  },
  {
    key: 'widget',
    label: 'Widget',
    fixtures: widgetFixtures,
  },
  {
    key: 'agent',
    label: 'Agent / Message',
    fixtures: [...agentFixtures, ...sendMessageFixtures],
  },
  {
    key: 'office',
    label: 'Office / 图表',
    fixtures: [...chartFixtures, ...officeFixtures],
  },
  {
    key: 'media',
    label: '图片 / 视频 / URL / 浏览器',
    fixtures: [...imageProcessFixtures, ...videoFixtures, ...openUrlFixtures, ...browserFixtures],
  },
  {
    key: 'jobs',
    label: 'Jobs / Sleep / Skill / Scheduled',
    fixtures: [...jobsFixtures, ...sleepFixtures, ...loadSkillFixtures, ...scheduledFixtures],
  },
  {
    key: 'project',
    label: 'Project / Search',
    fixtures: [
      ...projectFixtures,
      ...webFetchFixtures,
      ...webSearchFixtures,
      ...toolSearchFixtures,
    ],
  },
  {
    key: 'cloud',
    label: 'Cloud',
    fixtures: [...cloudGenerateFixtures, ...cloudLoginFixtures, ...cloudUserInfoFixtures],
  },
]
