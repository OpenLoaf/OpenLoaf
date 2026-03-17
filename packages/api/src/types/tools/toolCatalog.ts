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
  browserScreenshotToolDef,
  browserDownloadImageToolDef,
} from "./browserAutomation";
import { calendarQueryToolDef, calendarMutateToolDef } from "./calendar";
import { projectQueryToolDef, projectMutateToolDef } from "./db";
import { boardQueryToolDef, boardMutateToolDef } from "./board";
import { emailQueryToolDef, emailMutateToolDef } from "./email";
import { imageGenerateToolDef, videoGenerateToolDef, listMediaModelsToolDef } from "./mediaGenerate";
import { excelQueryToolDef, excelMutateToolDef } from "./excel";
import { wordQueryToolDef, wordMutateToolDef } from "./word";
import { pptxQueryToolDef, pptxMutateToolDef } from "./pptx";
import { pdfQueryToolDef, pdfMutateToolDef } from "./pdf";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "./agent";
import {
  shellCommandToolDef,
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
import { imageProcessToolDef } from "./imageProcess";
import { videoConvertToolDef } from "./videoConvert";
import { videoDownloadToolDef } from "./videoDownload";
import { docConvertToolDef } from "./docConvert";
import { fileInfoToolDef } from "./fileInfo";
import { webSearchToolDef } from "./webSearch";
import { webFetchToolDef } from "./webFetch";
import { toolSearchToolDef } from "./toolSearch";
import { memorySearchToolDef, memoryGetToolDef } from "./memory";
import { loadSkillToolDef } from "./skill";

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
  browserScreenshotToolDef,
  browserDownloadImageToolDef,
  readFileToolDef,
  listDirToolDef,
  grepFilesToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  shellCommandToolDef,
  emailQueryToolDef,
  emailMutateToolDef,
  calendarQueryToolDef,
  calendarMutateToolDef,
  excelQueryToolDef,
  excelMutateToolDef,
  wordQueryToolDef,
  wordMutateToolDef,
  pptxQueryToolDef,
  pptxMutateToolDef,
  pdfQueryToolDef,
  pdfMutateToolDef,
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
  boardQueryToolDef,
  boardMutateToolDef,
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
  timeNowToolDef,
  updatePlanToolDef,
  requestUserInputToolDef,
  jsxCreateToolDef,
  subAgentToolDef,
  chartRenderToolDef,
  taskManageToolDef,
  taskStatusToolDef,
  imageProcessToolDef,
  videoConvertToolDef,
  videoDownloadToolDef,
  docConvertToolDef,
  fileInfoToolDef,
  webSearchToolDef,
  webFetchToolDef,
  loadSkillToolDef,
  memorySearchToolDef,
  memoryGetToolDef,
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
  'shell-command': { keywords: ['shell', 'bash', 'command', 'terminal', 'execute', 'run', 'script'], group: 'shell' },
  'open-url': { keywords: ['url', 'link', 'browser', 'open', 'web', 'navigate', 'website'], group: 'web' },
  'browser-snapshot': { keywords: ['browser', 'screenshot', 'snapshot', 'capture', 'page'], group: 'web' },
  'browser-observe': { keywords: ['browser', 'observe', 'watch', 'monitor', 'dom', 'elements'], group: 'web' },
  'browser-extract': { keywords: ['browser', 'extract', 'scrape', 'content', 'data', 'page'], group: 'web' },
  'browser-act': { keywords: ['browser', 'click', 'type', 'interact', 'automate', 'action'], group: 'web' },
  'browser-wait': { keywords: ['browser', 'wait', 'load', 'ready', 'page'], group: 'web' },
  'browser-screenshot': { keywords: ['browser', 'screenshot', 'capture', 'page', 'image', 'photo'], group: 'web' },
  'browser-download-image': { keywords: ['browser', 'download', 'image', 'picture', 'save', 'photo', 'img'], group: 'web' },
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
  'board-query': { keywords: ['board', 'canvas', 'whiteboard', 'drawing', 'list', 'query', 'search', '画布', '白板'], group: 'board' },
  'board-mutate': { keywords: ['board', 'canvas', 'whiteboard', 'drawing', 'create', 'delete', 'update', 'duplicate', 'clear', 'pin', '画布', '白板'], group: 'board' },
  'task-manage': { keywords: ['task', 'todo', 'reminder', 'schedule', 'create', 'manage', 'cancel'], group: 'task' },
  'task-status': { keywords: ['task', 'status', 'progress', 'check', 'query', 'active'], group: 'task' },
  'excel-query': { keywords: ['excel', 'spreadsheet', 'xlsx', 'csv', 'sheet', 'cell', 'read'], group: 'office' },
  'excel-mutate': { keywords: ['excel', 'spreadsheet', 'xlsx', 'create', 'write', 'formula'], group: 'office' },
  'word-query': { keywords: ['word', 'docx', 'document', 'read', 'text', 'html', 'markdown'], group: 'office' },
  'word-mutate': { keywords: ['word', 'docx', 'document', 'create', 'write', 'edit', 'xml'], group: 'office' },
  'pptx-query': { keywords: ['pptx', 'ppt', 'powerpoint', 'slide', 'presentation', 'read'], group: 'office' },
  'pptx-mutate': { keywords: ['pptx', 'ppt', 'powerpoint', 'slide', 'presentation', 'create', 'edit'], group: 'office' },
  'pdf-query': { keywords: ['pdf', 'document', 'read', 'text', 'form', 'structure'], group: 'office' },
  'pdf-mutate': { keywords: ['pdf', 'document', 'create', 'fill', 'merge', 'write', 'form'], group: 'office' },
  'generate-widget': { keywords: ['widget', 'generate', 'create', 'component', 'ui'], group: 'ui' },
  'widget-init': { keywords: ['widget', 'init', 'initialize', 'setup'], group: 'ui' },
  'widget-list': { keywords: ['widget', 'list', 'available', 'browse'], group: 'ui' },
  'widget-get': { keywords: ['widget', 'get', 'fetch', 'retrieve', 'detail'], group: 'ui' },
  'widget-check': { keywords: ['widget', 'check', 'validate', 'verify', 'status'], group: 'ui' },
  'sub-agent': { keywords: ['agent', 'sub', 'delegate', 'dispatch', 'spawn'], group: 'agent' },
  'image-process': { keywords: ['image', 'picture', 'photo', 'resize', 'crop', 'rotate', 'convert', 'format', 'compress', 'sharp', 'jpg', 'png', 'webp'], group: 'convert' },
  'video-convert': { keywords: ['video', 'audio', 'convert', 'format', 'ffmpeg', 'mp4', 'mp3', 'extract', 'transcode'], group: 'convert' },
  'video-download': { keywords: ['video', 'download', 'url', 'yt-dlp', 'save', 'clip', 'reel', 'movie'], group: 'media' },
  'doc-convert': { keywords: ['document', 'convert', 'format', 'docx', 'pdf', 'html', 'markdown', 'csv', 'xlsx', 'txt', 'transform', 'word', 'export', 'import', 'to'], group: 'convert' },
  'file-info': { keywords: ['file', 'info', 'metadata', 'size', 'type', 'mime', 'resolution', 'duration', 'pages', 'details', 'stat', 'width', 'height', 'image', 'picture', 'photo', 'video', 'audio', 'pdf', 'excel', 'spreadsheet'], group: 'fileRead' },
  'web-search': { keywords: ['search', 'web', 'internet', 'google', 'query', 'lookup', 'find', 'latest', 'news', 'information', 'online'], group: 'web' },
  'web-fetch': { keywords: ['fetch', 'url', 'http', 'get', 'api', 'request', 'content', 'download', 'page', 'website'], group: 'web' },
  'load-skill': { keywords: ['skill', 'load', 'guide', 'expertise', 'knowledge'], group: 'core' },
  'memory-search': { keywords: ['memory', 'remember', 'recall', 'history', 'search', 'past'], group: 'memory' },
  'memory-get': { keywords: ['memory', 'read', 'get', 'detail', 'recall'], group: 'memory' },
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
