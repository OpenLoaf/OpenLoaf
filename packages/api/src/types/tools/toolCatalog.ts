/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { openUrlToolDef } from "./browser";
import {
  browserSnapshotToolDef,
  browserObserveToolDef,
  browserExtractToolDef,
  browserActToolDef,
  browserWaitToolDef,
} from "./browserAutomation";
import { calendarQueryToolDef, calendarMutateToolDef } from "./calendar";
import { projectQueryToolDef, projectMutateToolDef } from "./db";
import { emailQueryToolDef, emailMutateToolDef } from "./email";
import { imageGenerateToolDef, videoGenerateToolDef, listMediaModelsToolDef } from "./mediaGenerate";
import { officeExecuteToolDef } from "./office";
import { testApprovalToolDef } from "./approvalTest";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "./agent";
import {
  shellToolDef,
  shellCommandToolDef,
  execCommandToolDef,
  writeStdinToolDef,
  readFileToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  listDirToolDef,
  grepFilesToolDef,
  updatePlanToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
} from "./runtime";
import { timeNowToolDef } from "./system";
import { requestUserInputToolDef } from "./userInput";
import { jsxCreateToolDef } from "./jsxCreate";
import { chartRenderToolDef } from "./chart";
import {
  widgetInitToolDef,
  widgetListToolDef,
  widgetGetToolDef,
  widgetCheckToolDef,
  generateWidgetToolDef,
} from "./widget";
import { subAgentToolDef } from "./subAgent";
import { taskManageToolDef, taskStatusToolDef } from "./task";
import { toolSearchToolDef } from "./toolSearch";

export type ToolCatalogItem = {
  id: string;
  label: string;
  description: string;
};

export type ToolCatalogExtendedItem = ToolCatalogItem & {
  keywords: string[];
  group: string;
};

type ToolDefLike = { id: string; name?: string; description?: string };

const TOOL_DEFS: ToolDefLike[] = [
  toolSearchToolDef,
  openUrlToolDef,
  browserSnapshotToolDef,
  browserObserveToolDef,
  browserExtractToolDef,
  browserActToolDef,
  browserWaitToolDef,
  readFileToolDef,
  listDirToolDef,
  grepFilesToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  shellToolDef,
  shellCommandToolDef,
  execCommandToolDef,
  writeStdinToolDef,
  emailQueryToolDef,
  emailMutateToolDef,
  calendarQueryToolDef,
  calendarMutateToolDef,
  officeExecuteToolDef,
  listMediaModelsToolDef,
  imageGenerateToolDef,
  videoGenerateToolDef,
  widgetInitToolDef,
  widgetListToolDef,
  widgetGetToolDef,
  widgetCheckToolDef,
  generateWidgetToolDef,
  projectQueryToolDef,
  projectMutateToolDef,
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
  timeNowToolDef,
  updatePlanToolDef,
  testApprovalToolDef,
  requestUserInputToolDef,
  jsxCreateToolDef,
  subAgentToolDef,
  chartRenderToolDef,
  taskManageToolDef,
  taskStatusToolDef,
];

// 逻辑：统一生成工具元数据，避免前端重复维护名称与描述。
export const TOOL_CATALOG: ToolCatalogItem[] = TOOL_DEFS.map((def) => ({
  id: def.id,
  label: def.name ?? def.id,
  description: def.description ?? "",
}));

export const TOOL_CATALOG_MAP = new Map(
  TOOL_CATALOG.map((item) => [item.id, item]),
);

/** Resolve tool metadata by id. */
export function resolveToolCatalogItem(id: string): ToolCatalogItem {
  return TOOL_CATALOG_MAP.get(id) ?? { id, label: id, description: "" };
}

/** Extended tool catalog with keywords and groups for ToolSearch. */
const TOOL_KEYWORDS: Record<string, { keywords: string[]; group: string }> = {
  'tool-search': { keywords: ['search', 'find', 'discover', 'load', 'tool'], group: 'core' },
  'time-now': { keywords: ['time', 'now', 'date', 'clock', 'current', 'timezone'], group: 'core' },
  'update-plan': { keywords: ['plan', 'step', 'progress', 'update', 'track'], group: 'core' },
  'request-user-input': { keywords: ['ask', 'input', 'confirm', 'choice', 'question', 'user', 'approval'], group: 'core' },
  'jsx-create': { keywords: ['jsx', 'component', 'ui', 'render', 'display', 'card', 'layout'], group: 'ui' },
  'spawn-agent': { keywords: ['spawn', 'agent', 'delegate', 'sub', 'dispatch', 'create'], group: 'agent' },
  'send-input': { keywords: ['send', 'input', 'agent', 'message', 'communicate'], group: 'agent' },
  'wait-agent': { keywords: ['wait', 'agent', 'result', 'response', 'poll'], group: 'agent' },
  'abort-agent': { keywords: ['abort', 'cancel', 'stop', 'kill', 'agent', 'terminate'], group: 'agent' },
  'read-file': { keywords: ['read', 'file', 'open', 'cat', 'content', 'view', 'text'], group: 'fileRead' },
  'list-dir': { keywords: ['list', 'directory', 'folder', 'ls', 'browse', 'tree', 'files'], group: 'fileRead' },
  'grep-files': { keywords: ['grep', 'search', 'find', 'pattern', 'regex', 'match', 'text'], group: 'fileRead' },
  'apply-patch': { keywords: ['patch', 'edit', 'write', 'modify', 'change', 'file', 'update'], group: 'fileWrite' },
  'edit-document': { keywords: ['edit', 'document', 'modify', 'write', 'update', 'doc'], group: 'fileWrite' },
  'shell': { keywords: ['shell', 'bash', 'terminal', 'command', 'execute', 'run', 'interactive'], group: 'shell' },
  'shell-command': { keywords: ['shell', 'bash', 'command', 'terminal', 'execute', 'run', 'script'], group: 'shell' },
  'exec-command': { keywords: ['exec', 'execute', 'command', 'run', 'process'], group: 'shell' },
  'write-stdin': { keywords: ['stdin', 'write', 'input', 'pipe', 'interactive'], group: 'shell' },
  'open-url': { keywords: ['url', 'link', 'browser', 'open', 'web', 'navigate', 'website'], group: 'web' },
  'browser-snapshot': { keywords: ['browser', 'screenshot', 'snapshot', 'capture', 'page'], group: 'web' },
  'browser-observe': { keywords: ['browser', 'observe', 'watch', 'monitor', 'dom', 'elements'], group: 'web' },
  'browser-extract': { keywords: ['browser', 'extract', 'scrape', 'content', 'data', 'page'], group: 'web' },
  'browser-act': { keywords: ['browser', 'click', 'type', 'interact', 'automate', 'action'], group: 'web' },
  'browser-wait': { keywords: ['browser', 'wait', 'load', 'ready', 'page'], group: 'web' },
  'image-generate': { keywords: ['image', 'picture', 'photo', 'draw', 'generate', 'art', 'illustration'], group: 'media' },
  'video-generate': { keywords: ['video', 'clip', 'animation', 'generate', 'motion', 'movie'], group: 'media' },
  'list-media-models': { keywords: ['media', 'model', 'list', 'available', 'image', 'video'], group: 'media' },
  'chart-render': { keywords: ['chart', 'graph', 'plot', 'data', 'visualization', 'diagram'], group: 'ui' },
  'js-repl': { keywords: ['javascript', 'repl', 'eval', 'calculate', 'code', 'script', 'compute'], group: 'code' },
  'js-repl-reset': { keywords: ['repl', 'reset', 'clear', 'javascript', 'context'], group: 'code' },
  'email-query': { keywords: ['email', 'mail', 'inbox', 'message', 'search', 'folder', 'read'], group: 'email' },
  'email-mutate': { keywords: ['email', 'mail', 'send', 'reply', 'forward', 'draft', 'compose', 'write'], group: 'email' },
  'calendar-query': { keywords: ['calendar', 'event', 'schedule', 'meeting', 'date', 'agenda'], group: 'calendar' },
  'calendar-mutate': { keywords: ['calendar', 'event', 'create', 'update', 'delete', 'meeting', 'schedule'], group: 'calendar' },
  'project-query': { keywords: ['project', 'database', 'query', 'data', 'record', 'search', 'list'], group: 'db' },
  'project-mutate': { keywords: ['project', 'database', 'create', 'update', 'delete', 'modify', 'write'], group: 'db' },
  'task-manage': { keywords: ['task', 'todo', 'reminder', 'schedule', 'create', 'manage', 'cancel'], group: 'task' },
  'task-status': { keywords: ['task', 'status', 'progress', 'check', 'query', 'active'], group: 'task' },
  'office-execute': { keywords: ['office', 'document', 'spreadsheet', 'wps', 'excel', 'word'], group: 'office' },
  'generate-widget': { keywords: ['widget', 'generate', 'create', 'component', 'ui'], group: 'ui' },
  'widget-init': { keywords: ['widget', 'init', 'initialize', 'setup'], group: 'ui' },
  'widget-list': { keywords: ['widget', 'list', 'available', 'browse'], group: 'ui' },
  'widget-get': { keywords: ['widget', 'get', 'fetch', 'retrieve', 'detail'], group: 'ui' },
  'widget-check': { keywords: ['widget', 'check', 'validate', 'verify', 'status'], group: 'ui' },
  'test-approval': { keywords: ['test', 'approval', 'review', 'verify', 'check'], group: 'core' },
  'sub-agent': { keywords: ['agent', 'sub', 'delegate', 'dispatch', 'spawn'], group: 'agent' },
};

export const TOOL_CATALOG_EXTENDED: ToolCatalogExtendedItem[] = TOOL_CATALOG.map(
  (item) => {
    const meta = TOOL_KEYWORDS[item.id];
    return {
      ...item,
      keywords: meta?.keywords ?? [],
      group: meta?.group ?? 'core',
    };
  },
);
