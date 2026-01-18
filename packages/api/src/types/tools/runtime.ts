import { z } from "zod";

export const shellCommandToolDef = {
  id: "shell-command",
  description:
    "执行受控的命令行指令（以参数数组形式传入），适用于一次性命令调用。支持工作目录、超时与沙盒权限控制。",
  parameters: z.object({
    command: z.array(z.string()).min(1),
    workdir: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const execCommandToolDef = {
  id: "exec-command",
  description:
    "启动可交互的统一执行会话，返回 sessionId 供后续写入 stdin 并读取输出。",
  parameters: z.object({
    cmd: z.string().min(1),
    workdir: z.string().optional(),
    shell: z.string().optional(),
    login: z.boolean().optional(),
    tty: z.boolean().optional(),
    yieldTimeMs: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const writeStdinToolDef = {
  id: "write-stdin",
  description: "向已建立的统一执行会话写入输入并读取新增输出。",
  parameters: z.object({
    sessionId: z.string().min(1),
    chars: z.string().optional(),
    yieldTimeMs: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  }),
  component: null,
} as const;

export const readFileToolDef = {
  id: "read-file",
  description:
    "读取文件内容，支持行偏移、最大行数与缩进树形切片等模式。",
  parameters: z.object({
    path: z.string().min(1),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
    mode: z.enum(["slice", "indentation"]).optional(),
    anchorLine: z.number().int().min(1).optional(),
    maxLevels: z.number().int().min(0).optional(),
    includeSiblings: z.boolean().optional(),
    includeHeader: z.boolean().optional(),
    maxLines: z.number().int().min(1).optional(),
  }),
  component: null,
} as const;

export const listDirToolDef = {
  id: "list-dir",
  description: "列出指定目录下的文件与子目录，可控制深度与分页。",
  parameters: z.object({
    path: z.string().min(1),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
    depth: z.number().int().min(1).optional(),
  }),
  component: null,
} as const;

export const grepFilesToolDef = {
  id: "grep-files",
  description: "在指定路径范围内按正则检索文本内容。",
  parameters: z.object({
    pattern: z.string().min(1),
    include: z.string().optional(),
    path: z.string().optional(),
    limit: z.number().int().min(1).optional(),
  }),
  component: null,
} as const;
