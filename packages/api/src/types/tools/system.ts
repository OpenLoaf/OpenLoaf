import { z } from "zod";

export const fileReadToolDef = {
  id: "file-read",
  description:
    "读取指定文件的内容，返回UTF-8编码的文本。适用于需要访问项目内提示词、模板或文档片段的场景。仅允许读取白名单目录下的文件，并有文件大小限制。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "文件路径（相对或绝对）。仅允许访问白名单目录：apps/server/src/chat、apps/server/prompts、docs。",
      ),
  }),
  component: null,
} as const;

export const shellReadonlyToolDef = {
  id: "shell-readonly",
  description:
    "执行只读 shell 命令并返回输出，适用于获取系统信息、查看文件列表、查看当前目录等场景。仅允许执行安全的只读命令，包括 date、uname、whoami、pwd、ls，禁止使用管道、重定向等复杂操作。",
  parameters: z.object({
    cmd: z
      .string()
      .describe(
        "要执行的命令。仅允许：date、uname、whoami、pwd、ls。禁止 | ; && > 等复杂操作。",
      ),
  }),
  component: null,
} as const;

export const shellWriteToolDef = {
  id: "shell-write",
  description:
    "执行可能修改文件系统的命令，需要审批。适用于创建目录等场景。当前仅支持 mkdir <path> 命令，且路径必须在白名单目录内。",
  parameters: z.object({
    cmd: z
      .string()
      .describe(
        "要执行的命令。当前仅支持：mkdir <path>。路径必须在白名单目录内。",
      ),
  }),
  component: null,
} as const;

export const shellDestructiveToolDef = {
  id: "shell-destructive",
  description:
    "执行破坏性命令，需要审批。适用于删除文件等场景。当前仅支持 rm <file> 命令，且路径必须在白名单目录内，只能删除文件，不能删除目录。",
  parameters: z.object({
    cmd: z
      .string()
      .describe(
        "要执行的命令。当前仅支持：rm <file>。路径必须在白名单目录内，且只能删除文件。",
      ),
  }),
  component: null,
} as const;

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
