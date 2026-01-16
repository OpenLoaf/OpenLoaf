import { z } from "zod";
import { RiskType } from "../toolResult";

/** File read tool definition. */
export const fileReadToolDef = {
  id: "file-read",
  description:
    "读取指定文件的文本内容（UTF-8）。仅允许访问当前 projectId 对应的项目目录内路径。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "文件路径（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。",
      ),
  }),
  component: null,
} as const;

/** File list tool definition. */
export const fileListToolDef = {
  id: "file-list",
  description:
    "列出指定目录的文件与子目录，仅允许访问当前 projectId 对应的项目目录内路径。",
  parameters: z.object({
    path: z
      .string()
      .optional()
      .describe(
        "目录路径（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。默认项目根。",
      ),
  }),
  component: null,
} as const;

/** File search tool definition. */
export const fileSearchToolDef = {
  id: "file-search",
  description:
    "在项目目录内搜索文本内容，返回匹配的文件路径列表。",
  parameters: z.object({
    query: z.string().describe("搜索关键词（纯文本匹配）。"),
    path: z
      .string()
      .optional()
      .describe(
        "搜索根目录（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。默认项目根。",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("返回条数上限（默认 50）。"),
  }),
  component: null,
} as const;

/** File write tool definition. */
export const fileWriteToolDef = {
  id: "file-write",
  description:
    "写入文本内容到指定文件路径（可覆盖或追加），仅允许访问当前 projectId 对应的项目目录内路径。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "文件路径（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。",
      ),
    content: z.string().describe("要写入的文本内容。"),
    mode: z
      .enum(["overwrite", "append"])
      .optional()
      .describe("写入模式：overwrite 或 append（默认 overwrite）。"),
  }),
  component: null,
} as const;

/** File delete tool definition. */
export const fileDeleteToolDef = {
  id: "file-delete",
  description:
    "删除指定文件（不支持删除目录），仅允许访问当前 projectId 对应的项目目录内路径。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "文件路径（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。",
      ),
  }),
  component: null,
} as const;

/** Excel read tool definition. */
export const fileReadExcelToolDef = {
  id: "file-read-excel",
  description:
    "读取 Excel（.xlsx/.xls/.xlsm）文件内容并返回纯文本，若包含图片则保存到当前会话的 .tenas/chat/{sessionId}/ 并返回引用（.xls 仅支持文本），仅允许访问当前 projectId 对应的项目目录内路径。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "文件路径（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。",
      ),
  }),
  component: null,
} as const;

/** Docx read tool definition. */
export const fileReadDocxToolDef = {
  id: "file-read-docx",
  description:
    "读取 Word（.docx）文件内容并返回纯文本，若包含图片则保存到当前会话的 .tenas/chat/{sessionId}/ 并返回引用，仅允许访问当前 projectId 对应的项目目录内路径。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "文件路径（相对项目根目录；跨项目可用 [projectId]/...；路径不要使用 URL Encoding 编码）。",
      ),
  }),
  component: null,
} as const;

/** Shell readonly tool definition. */
export const shellReadonlyToolDef = {
  id: "shell-readonly",
  description:
    "执行只读 shell 命令并返回输出（MVP：仅允许 date、uname、whoami、pwd、ls）。",
  parameters: z.object({
    cmd: z
      .string()
      .describe("要执行的命令。仅允许：date、uname、whoami、pwd、ls。"),
  }),
  component: null,
} as const;

/** Shell write tool definition. */
export const shellWriteToolDef = {
  id: "shell-write",
  description:
    "执行会修改文件系统的命令（MVP：仅支持 mkdir <path>）。",
  parameters: z.object({
    cmd: z.string().describe("要执行的命令。仅支持：mkdir <path>。"),
  }),
  component: null,
} as const;

/** Shell destructive tool definition. */
export const shellDestructiveToolDef = {
  id: "shell-destructive",
  description:
    "执行破坏性命令（MVP：仅支持 rm <file>，且不能删除目录）。",
  parameters: z.object({
    cmd: z.string().describe("要执行的命令。仅支持：rm <file>。"),
  }),
  component: null,
} as const;

export type ShellCommandAllowlistEntry = {
  /** Entry id. */
  id: string;
  /** Command display text. */
  command: string;
  /** Risk type for UI. */
  riskType: RiskType;
  /** Human-readable description. */
  description: string;
};

/**
 * Shell 工具命令白名单（用于 UI 展示）
 * - 说明：该列表是“人类可读”的摘要，详细规则以 server 校验逻辑为准。
 */
export const shellCommandAllowlistEntries = [
  {
    id: "date",
    command: "date",
    riskType: RiskType.Read,
    description: "获取当前时间。",
  },
  {
    id: "uname",
    command: "uname",
    riskType: RiskType.Read,
    description: "获取系统信息。",
  },
  {
    id: "whoami",
    command: "whoami",
    riskType: RiskType.Read,
    description: "获取当前用户。",
  },
  {
    id: "pwd",
    command: "pwd",
    riskType: RiskType.Read,
    description: "获取项目根目录路径。",
  },
  {
    id: "ls",
    command: "ls <path>",
    riskType: RiskType.Read,
    description: "列出指定目录的文件（仅允许项目内路径）。",
  },
  {
    id: "mkdir",
    command: "mkdir <path>",
    riskType: RiskType.Write,
    description: "创建目录（需要审批，仅允许项目内路径）。",
  },
  {
    id: "rm",
    command: "rm <file>",
    riskType: RiskType.Destructive,
    description: "删除文件（需要审批，仅允许项目内路径）。",
  },
] as const satisfies ReadonlyArray<ShellCommandAllowlistEntry>;

export const timeNowToolDef = {
  id: "time-now",
  description:
    "获取当前服务器时间信息，包括格式化的时间字符串、Unix时间戳（毫秒）和时区。当需要了解当前时间或进行时间相关计算时调用此工具，可通过可选参数指定时区。",
  parameters: z.object({
    timezone: z
      .string()
      .optional()
      .describe(
        "可选：时区名称（例如 Asia/Shanghai）。不传则使用当前系统时区。",
      ),
  }),
  component: null,
} as const;

export const webFetchToolDef = {
  id: "web-fetch",
  description:
    "通过 HTTP GET 请求抓取指定网页的内容并返回文本格式。适用于需要获取网页内容（如文档、文章、新闻等）的场景。默认禁止访问 localhost 和私有网络地址以防止安全风险，有超时和最大字节数限制。",
  parameters: z.object({
    url: z.string().describe("目标网页 URL（仅支持 http/https）。"),
  }),
  component: null,
} as const;

export const webSearchToolDef = {
  id: "web-search",
  description:
    "执行网络搜索并返回结果列表，包括标题、URL和摘要信息。适用于需要查找特定信息、获取最新数据或了解某个主题的场景。需要配置搜索服务API，可通过参数指定搜索关键词和返回结果数量上限。",
  parameters: z.object({
    query: z.string().describe("搜索关键词"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("返回条数上限"),
  }),
  component: null,
} as const;

/**
 * System Tool 风险分级（统一在 api 包内维护，供 server/web 共用）
 * - 说明：AI SDK v6 beta 的 Tool 类型没有 `metadata` 字段，因此用映射表维护。
 */
export const systemToolMeta = {
  [timeNowToolDef.id]: { riskType: RiskType.Read },
  [webFetchToolDef.id]: { riskType: RiskType.Read },
  [webSearchToolDef.id]: { riskType: RiskType.Read },
  [fileReadToolDef.id]: { riskType: RiskType.Read },
  [fileListToolDef.id]: { riskType: RiskType.Read },
  [fileSearchToolDef.id]: { riskType: RiskType.Read },
  [fileReadExcelToolDef.id]: { riskType: RiskType.Read },
  [fileReadDocxToolDef.id]: { riskType: RiskType.Read },
  [shellReadonlyToolDef.id]: { riskType: RiskType.Read },
  [fileWriteToolDef.id]: { riskType: RiskType.Write },
  [shellWriteToolDef.id]: { riskType: RiskType.Write },
  [fileDeleteToolDef.id]: { riskType: RiskType.Destructive },
  [shellDestructiveToolDef.id]: { riskType: RiskType.Destructive },
} as const;
