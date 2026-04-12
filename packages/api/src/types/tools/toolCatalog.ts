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
  browserActToolDef,
  browserWaitToolDef,
  browserDownloadImageToolDef,
} from "./browserAutomation";
import { calendarQueryToolDef, calendarMutateToolDef } from "./calendar";
import { projectQueryToolDef, projectMutateToolDef } from "./db";
import { boardQueryToolDef, boardMutateToolDef } from "./board";
import { emailQueryToolDef, emailMutateToolDef } from "./email";
import { excelQueryToolDef, excelMutateToolDef } from "./excel";
import { wordQueryToolDef, wordMutateToolDef } from "./word";
import { pptxQueryToolDef, pptxMutateToolDef } from "./pptx";
import { pdfQueryToolDef, pdfMutateToolDef } from "./pdf";
import {
  agentToolDef,
  sendMessageToolDef,
} from "./agent";
import {
  bashToolDef,
  readToolDef,
  editToolDef,
  writeToolDef,
  globToolDef,
  grepToolDef,
  editDocumentToolDef,
} from "./runtime";
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
import {
  scheduledTaskManageToolDef,
  scheduledTaskStatusToolDef,
  scheduledTaskWaitToolDef,
} from "./scheduledTask";
import {
  bgListToolDef,
  bgOutputToolDef,
  bgKillToolDef,
} from "./bgTask";
import { sleepToolDef } from "./sleep";
import { imageProcessToolDef } from "./imageProcess";
import { videoConvertToolDef } from "./videoConvert";
import { videoDownloadToolDef } from "./videoDownload";
import { docConvertToolDef } from "./docConvert";
import { fileInfoToolDef } from "./fileInfo";
import { webSearchToolDef } from "./webSearch";
import { webFetchToolDef } from "./webFetch";
import { toolSearchToolDef } from "./toolSearch";
import { memorySaveToolDef, memorySearchToolDef, memoryGetToolDef } from "./memory";
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
  browserActToolDef,
  browserWaitToolDef,
  browserDownloadImageToolDef,
  readToolDef,
  editToolDef,
  writeToolDef,
  globToolDef,
  grepToolDef,
  editDocumentToolDef,
  bashToolDef,
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
  widgetInitToolDef,
  widgetListToolDef,
  widgetGetToolDef,
  widgetCheckToolDef,
  generateWidgetToolDef,
  projectQueryToolDef,
  projectMutateToolDef,
  boardQueryToolDef,
  boardMutateToolDef,
  agentToolDef,
  sendMessageToolDef,
  requestUserInputToolDef,
  jsxCreateToolDef,
  subAgentToolDef,
  chartRenderToolDef,
  scheduledTaskManageToolDef,
  scheduledTaskStatusToolDef,
  scheduledTaskWaitToolDef,
  bgListToolDef,
  bgOutputToolDef,
  bgKillToolDef,
  sleepToolDef,
  imageProcessToolDef,
  videoConvertToolDef,
  videoDownloadToolDef,
  docConvertToolDef,
  fileInfoToolDef,
  webSearchToolDef,
  webFetchToolDef,
  loadSkillToolDef,
  memorySaveToolDef,
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
  'ToolSearch': { keywords: ['search', 'find', 'discover', 'load', 'tool'], group: 'core' },
  'AskUserQuestion': { keywords: ['ask', 'input', 'confirm', 'choice', 'question', 'user', 'approval'], group: 'core' },
  'JsxCreate': { keywords: ['jsx', 'component', 'ui', 'render', 'display', 'card', 'layout'], group: 'ui' },
  'Agent': { keywords: ['agent', 'spawn', 'delegate', 'sub', 'dispatch', 'create', 'background'], group: 'agent' },
  'SendMessage': { keywords: ['send', 'message', 'agent', 'communicate', 'resume', 'continue'], group: 'agent' },
  'Read': { keywords: ['read', 'file', 'open', 'cat', 'content', 'view', 'text', 'pdf', 'image'], group: 'fileRead' },
  'Edit': { keywords: ['edit', 'modify', 'replace', 'change', 'update', 'file', 'string'], group: 'fileWrite' },
  'Write': { keywords: ['write', 'create', 'file', 'new', 'overwrite', 'save'], group: 'fileWrite' },
  'Glob': { keywords: ['glob', 'find', 'file', 'search', 'pattern', 'match', 'directory', 'ls'], group: 'fileRead' },
  'Grep': { keywords: ['grep', 'search', 'find', 'pattern', 'regex', 'match', 'text', 'content', 'ripgrep'], group: 'fileRead' },
  'EditDocument': { keywords: ['edit', 'document', 'modify', 'write', 'update', 'doc'], group: 'fileWrite' },
  'Bash': { keywords: ['shell', 'bash', 'command', 'terminal', 'execute', 'run', 'script'], group: 'shell' },
  'OpenUrl': { keywords: ['url', 'link', 'browser', 'open', 'web', 'navigate', 'website'], group: 'web' },
  'BrowserSnapshot': { keywords: ['browser', 'screenshot', 'snapshot', 'capture', 'page', 'image', 'photo'], group: 'web' },
  'BrowserAct': { keywords: ['browser', 'click', 'type', 'interact', 'automate', 'action'], group: 'web' },
  'BrowserWait': { keywords: ['browser', 'wait', 'load', 'ready', 'page'], group: 'web' },
  'BrowserDownloadImage': { keywords: ['browser', 'download', 'image', 'picture', 'save', 'photo', 'img'], group: 'web' },
  'ChartRender': { keywords: ['chart', 'graph', 'plot', 'data', 'visualization', 'diagram'], group: 'ui' },
  'EmailQuery': { keywords: ['email', 'mail', 'inbox', 'message', 'search', 'folder', 'read'], group: 'email' },
  'EmailMutate': { keywords: ['email', 'mail', 'send', 'reply', 'forward', 'draft', 'compose', 'write'], group: 'email' },
  'CalendarQuery': { keywords: ['calendar', 'event', 'schedule', 'meeting', 'date', 'agenda'], group: 'calendar' },
  'CalendarMutate': { keywords: ['calendar', 'event', 'create', 'update', 'delete', 'meeting', 'schedule'], group: 'calendar' },
  'ProjectQuery': { keywords: ['project', 'database', 'query', 'data', 'record', 'search', 'list'], group: 'db' },
  'ProjectMutate': { keywords: ['project', 'database', 'create', 'update', 'delete', 'modify', 'write'], group: 'db' },
  'BoardQuery': { keywords: ['board', 'canvas', 'whiteboard', 'drawing', 'list', 'query', 'search', '画布', '白板'], group: 'board' },
  'BoardMutate': { keywords: ['board', 'canvas', 'whiteboard', 'drawing', 'create', 'delete', 'update', 'duplicate', 'clear', 'pin', '画布', '白板'], group: 'board' },
  'ScheduledTaskManage': { keywords: ['task', 'todo', 'reminder', 'schedule', 'create', 'manage', 'cancel'], group: 'task' },
  'ScheduledTaskStatus': { keywords: ['task', 'status', 'progress', 'check', 'query', 'active'], group: 'task' },
  'Jobs': { keywords: ['background', 'bg', 'list', 'process', 'running', 'shell', 'agent'], group: 'background' },
  'Tail': { keywords: ['background', 'bg', 'output', 'read', 'wait', 'block', 'shell', 'log'], group: 'background' },
  'Kill': { keywords: ['background', 'bg', 'kill', 'terminate', 'cancel', 'stop', 'process'], group: 'background' },
  'Sleep': { keywords: ['sleep', 'wait', 'pause', 'delay', 'idle', 'yield', 'background', 'notification'], group: 'background' },
  'ExcelQuery': { keywords: ['excel', 'spreadsheet', 'xlsx', 'csv', 'sheet', 'cell', 'read'], group: 'office' },
  'ExcelMutate': { keywords: ['excel', 'spreadsheet', 'xlsx', 'create', 'write', 'formula'], group: 'office' },
  'WordQuery': { keywords: ['word', 'docx', 'document', 'read', 'text', 'html', 'markdown'], group: 'office' },
  'WordMutate': { keywords: ['word', 'docx', 'document', 'create', 'write', 'edit', 'xml'], group: 'office' },
  'PptxQuery': { keywords: ['pptx', 'ppt', 'powerpoint', 'slide', 'presentation', 'read'], group: 'office' },
  'PptxMutate': { keywords: ['pptx', 'ppt', 'powerpoint', 'slide', 'presentation', 'create', 'edit'], group: 'office' },
  'PdfQuery': { keywords: ['pdf', 'document', 'read', 'text', 'form', 'structure', 'screenshot', 'page', 'image', 'render'], group: 'office' },
  'PdfMutate': { keywords: ['pdf', 'document', 'create', 'fill', 'merge', 'write', 'form'], group: 'office' },
  'GenerateWidget': { keywords: ['widget', 'generate', 'create', 'component', 'ui'], group: 'ui' },
  'WidgetInit': { keywords: ['widget', 'init', 'initialize', 'setup'], group: 'ui' },
  'WidgetList': { keywords: ['widget', 'list', 'available', 'browse'], group: 'ui' },
  'WidgetGet': { keywords: ['widget', 'get', 'fetch', 'retrieve', 'detail'], group: 'ui' },
  'WidgetCheck': { keywords: ['widget', 'check', 'validate', 'verify', 'status'], group: 'ui' },
  'SubAgent': { keywords: ['agent', 'sub', 'delegate', 'dispatch', 'spawn'], group: 'agent' },
  'ImageProcess': { keywords: ['image', 'picture', 'photo', 'resize', 'crop', 'rotate', 'convert', 'format', 'compress', 'sharp', 'jpg', 'png', 'webp'], group: 'convert' },
  'VideoConvert': { keywords: ['video', 'audio', 'convert', 'format', 'ffmpeg', 'mp4', 'mp3', 'extract', 'transcode'], group: 'convert' },
  'VideoDownload': { keywords: ['video', 'download', 'url', 'yt-dlp', 'save', 'clip', 'reel', 'movie'], group: 'media' },
  'DocConvert': { keywords: ['document', 'convert', 'format', 'docx', 'pdf', 'html', 'markdown', 'csv', 'xlsx', 'txt', 'transform', 'word', 'export', 'import', 'to'], group: 'convert' },
  'FileInfo': { keywords: ['file', 'info', 'metadata', 'size', 'type', 'mime', 'resolution', 'duration', 'pages', 'details', 'stat', 'width', 'height', 'image', 'picture', 'photo', 'video', 'audio', 'pdf', 'excel', 'spreadsheet'], group: 'fileRead' },
  'WebSearch': { keywords: ['search', 'web', 'internet', 'google', 'query', 'lookup', 'find', 'latest', 'news', 'information', 'online'], group: 'web' },
  'WebFetch': { keywords: ['fetch', 'url', 'http', 'get', 'api', 'request', 'content', 'download', 'page', 'website'], group: 'web' },
  'LoadSkill': { keywords: ['skill', 'load', 'guide', 'expertise', 'knowledge'], group: 'core' },
  'MemorySave': { keywords: ['memory', 'save', 'remember', 'persist', 'store', 'write', 'forget', 'delete', '记忆', '记住', '保存', '忘记'], group: 'memory' },
  'MemorySearch': { keywords: ['memory', 'remember', 'recall', 'history', 'search', 'past'], group: 'memory' },
  'MemoryGet': { keywords: ['memory', 'read', 'get', 'detail', 'recall'], group: 'memory' },
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

// ---------------------------------------------------------------------------
// MCP Dynamic Catalog — runtime-extensible catalog for MCP tools
// ---------------------------------------------------------------------------

/**
 * Runtime-mutable catalog for MCP tools.
 * Entries are added when MCP servers connect and removed on disconnect.
 * toolSearchTool unions this with TOOL_CATALOG_EXTENDED during search.
 */
const MCP_TOOL_CATALOG = new Map<string, ToolCatalogExtendedItem>();

/** Register an MCP tool catalog entry (called by MCPClientManager on connect). */
export function registerMcpCatalogEntry(entry: ToolCatalogExtendedItem): void {
  MCP_TOOL_CATALOG.set(entry.id, entry);
}

/** Unregister an MCP tool catalog entry. */
export function unregisterMcpCatalogEntry(toolId: string): void {
  MCP_TOOL_CATALOG.delete(toolId);
}

/** Unregister all MCP catalog entries for a given server (prefix match). */
export function unregisterMcpCatalogEntriesByServer(serverName: string): void {
  const prefix = `mcp__${serverName}__`;
  for (const id of MCP_TOOL_CATALOG.keys()) {
    if (id.startsWith(prefix)) MCP_TOOL_CATALOG.delete(id);
  }
}

/** Get all currently registered MCP catalog entries. */
export function getMcpCatalogEntries(): ToolCatalogExtendedItem[] {
  return [...MCP_TOOL_CATALOG.values()];
}

/**
 * Build keywords from an MCP tool description (simple tokenization).
 * Used when MCP server doesn't provide explicit keyword metadata.
 */
export function extractKeywordsFromDescription(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 10);
}
