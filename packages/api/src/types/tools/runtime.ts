/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

// 中文注释：运行时工具的审批策略由 server 侧 tool 实现决定，API 定义只描述参数与展示信息。

export const bashToolDef = {
  id: "Bash",
  readonly: false,
  name: "执行命令",
  description: `Executes a given bash command and returns its output.

The working directory persists between commands, but shell state does not.

IMPORTANT: Avoid using this tool to run \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands. Instead, use the appropriate dedicated tool:
 - File search: Use Glob (NOT find or ls)
 - Content search: Use Grep (NOT grep or rg)
 - Read files: Use Read (NOT cat/head/tail)
 - Edit files: Use Edit (NOT sed/awk)
 - Write files: Use Write (NOT echo >/cat <<EOF)

Instructions:
 - Always quote file paths that contain spaces with double quotes.
 - Try to maintain your current working directory by using absolute paths.
 - You may specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). Default timeout is 120000ms (2 minutes).`,
  parameters: z.object({
    command: z.string().min(1).describe("The command to execute"),
    description: z.string().optional().describe("Clear, concise description of what this command does"),
    timeout: z.number().int().min(1000).max(600000).optional().describe("Optional timeout in milliseconds (max 600000)"),
    run_in_background: z.boolean().optional().describe("Set to true to run this command in the background"),
  }),
  component: null,
} as const;

export const readToolDef = {
  id: "Read",
  readonly: true,
  name: "读取文件",
  description: `Reads a file from the local filesystem. You can access any file directly by using this tool.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- When you already know which part of the file you need, only read that part
- Results are returned with line numbers starting at 1
- This tool can read images (PNG, JPG, etc). When reading an image file the contents are presented visually.
- This tool can read PDF files (.pdf). For large PDFs (more than 10 pages), you MUST provide the pages parameter. Maximum 20 pages per request.
- This tool can only read files, not directories. To list a directory, use the Glob tool or Bash ls.`,
  parameters: z.object({
    file_path: z.string().min(1).describe("The absolute path to the file to read"),
    offset: z.number().int().min(1).optional().describe("The line number to start reading from"),
    limit: z.number().int().min(1).optional().describe("The number of lines to read"),
    pages: z.string().optional().describe('Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files.'),
  }),
  component: null,
} as const;

export const editToolDef = {
  id: "Edit",
  readonly: false,
  name: "编辑文件",
  description: `Performs exact string replacements in files.

Usage:
- You must use the Read tool at least once before editing a file. This tool will error if you attempt an edit without reading the file.
- The edit will FAIL if old_string is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replace_all to change every instance.
- Use replace_all for replacing and renaming strings across the file.
- ALWAYS prefer editing existing files to creating new ones.
- old_string and new_string must be different.`,
  parameters: z.object({
    file_path: z.string().min(1).describe("The absolute path to the file to modify"),
    old_string: z.string().min(1).describe("The text to replace"),
    new_string: z.string().describe("The text to replace it with (must be different from old_string)"),
    replace_all: z.boolean().optional().default(false).describe("Replace all occurrences of old_string (default false)"),
  }),
  component: null,
} as const;

export const writeToolDef = {
  id: "Write",
  readonly: false,
  name: "写入文件",
  description: `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- Prefer the Edit tool for modifying existing files — it only sends the diff. Only use this tool to create new files or for complete rewrites.`,
  parameters: z.object({
    file_path: z.string().min(1).describe("The absolute path to the file to write (must be absolute, not relative)"),
    content: z.string().describe("The content to write to the file"),
  }),
  component: null,
} as const;

export const editDocumentToolDef = {
  id: "EditDocument",
  readonly: false,
  name: "编辑文稿",
  description:
    "Writes the full updated MDX content to a document's `index.mdx` (inside a `tndoc_` folder). Use when the user asks to modify a document. For non-document files, use Write instead.",
  parameters: z.object({
    path: z.string().min(1).describe("文稿文件夹路径或 index.mdx 路径（相对当前项目或全局根目录）。"),
    content: z.string().describe("修改后的完整 MDX 内容。"),
  }),
  component: null,
} as const;

export const globToolDef = {
  id: "Glob",
  readonly: true,
  name: "搜索文件",
  description: `Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`,
  parameters: z.object({
    pattern: z.string().min(1).describe('The glob pattern to match files against'),
    path: z.string().optional().describe("The directory to search in. Defaults to the project root."),
  }),
  component: null,
} as const;

export const grepToolDef = {
  id: "Grep",
  readonly: true,
  name: "搜索内容",
  description: `A powerful search tool built on ripgrep.

Usage:
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py")
- Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
- Pattern syntax: Uses ripgrep - literal braces need escaping
- Multiline matching: For cross-line patterns, use multiline: true`,
  parameters: z.object({
    pattern: z.string().min(1).describe("The regular expression pattern to search for in file contents"),
    path: z.string().optional().describe("File or directory to search in. Defaults to project root."),
    glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")'),
    type: z.string().optional().describe('File type to search (e.g., "js", "py", "rust", "go")'),
    output_mode: z.enum(["content", "files_with_matches", "count"]).optional().describe('Output mode. Defaults to "files_with_matches"'),
    "-A": z.number().optional().describe("Number of lines to show after each match. Requires output_mode: content"),
    "-B": z.number().optional().describe("Number of lines to show before each match. Requires output_mode: content"),
    "-C": z.number().optional().describe("Number of lines to show before and after each match. Requires output_mode: content"),
    "-n": z.boolean().optional().describe("Show line numbers in output. Defaults to true"),
    "-i": z.boolean().optional().describe("Case insensitive search"),
    head_limit: z.number().optional().describe("Limit output to first N lines/entries. Defaults to 250"),
    offset: z.number().optional().describe("Skip first N lines/entries before applying head_limit. Defaults to 0"),
    multiline: z.boolean().optional().describe("Enable multiline mode where . matches newlines. Default: false"),
  }),
  component: null,
} as const;

/** Submit-plan tool definition — lightweight approval gate for plan files. */
export const submitPlanToolDef = {
  id: "SubmitPlan",
  readonly: true,
  name: "提交计划审批",
  description: `Use this tool when you have finished writing your plan to a PLAN file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to a PLAN file using the Write tool (e.g. "PLAN_1.md")
- This tool reads the plan from the file — pass the same path you gave to Write
- This tool simply signals that you're done planning and ready for the user to review and approve
- The user will see the contents of your plan file when they review it

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires **writing code**. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase — **do NOT use this tool**.

## Before Using This Tool
Ensure your plan is complete and unambiguous:
- If you have unresolved questions about requirements or approach, use AskUserQuestion first (in earlier phases)
- Once your plan is finalized, use THIS tool to request approval

**Important:** Do NOT use AskUserQuestion to ask "Is this plan okay?" or "Should I proceed?" — that's exactly what THIS tool does. SubmitPlan inherently requests user approval of your plan.

## Examples

1. Initial task: "Search for and understand the implementation of vim mode in the codebase" — Do not use SubmitPlan because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" — Use SubmitPlan after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" — If unsure about auth method (OAuth, JWT, etc.), use AskUserQuestion first, then use SubmitPlan after clarifying the approach.`,
  parameters: z.object({
    planFilePath: z
      .string()
      .min(1)
      .describe("The exact file path you passed to the Write tool (relative paths like \"PLAN_1.md\" are supported)."),
  }),
  component: null,
} as const;

/** Submit-plan payload type. */
export type SubmitPlanArgs = z.infer<typeof submitPlanToolDef.parameters>;

/** Plan step item — a plain string describing the step. */
export type PlanItem = string;
