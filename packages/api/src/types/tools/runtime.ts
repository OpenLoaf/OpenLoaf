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
  id: "edit-document",
  name: "编辑文稿",
  description:
    "触发：当用户要求修改文稿（tndoc_ 文件夹中的 index.mdx）时调用。用途：将修改后的完整 MDX 内容写入文稿的 index.mdx 文件。返回：`Wrote document: <relative-path>`。不适用：非文稿文件请用 write-file。",
  parameters: z.object({
    path: z.string().min(1).describe("文稿文件夹路径或 index.mdx 路径（相对当前项目或全局根目录）。"),
    content: z.string().describe("修改后的完整 MDX 内容。"),
  }),
  component: null,
} as const;

export const globToolDef = {
  id: "Glob",
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

const planStepStatusSchema = z
  .enum(["pending", "in_progress", "completed"])
  .describe("Plan step status: pending, in_progress, or completed.");

/** Update-plan mode schema. */
const planUpdateModeSchema = z.enum(["full", "patch"]).describe("Plan update mode.");

const planItemSchema = z.object({
  step: z.string().min(1).describe("Plan step text."),
  status: planStepStatusSchema.describe("Plan step status."),
});

const planPatchItemSchema = z.object({
  index: z.number().int().min(1).describe("1-based index of the plan step."),
  status: planStepStatusSchema.describe("Plan step status."),
});

const planUpdateItemSchema = z.object({
  step: z.string().min(1).optional().describe("Plan step text."),
  index: z.number().int().min(1).optional().describe("1-based index of the plan step."),
  status: planStepStatusSchema.describe("Plan step status."),
});

/** Update-plan tool definition for storing assistant plans. */
export const updatePlanToolDef = {
  id: "update-plan",
  name: "更新计划",
  description: `触发：当你需要把当前计划写入工具状态，以便 UI 展示或后续 patch 更新时调用。用途：提交 full/patch 计划步骤及状态。返回：{ ok: true, data: { updated: true } }。不适用：未维护计划时不要调用。

Updates the task plan for the current assistant turn.
Provide an optional explanation and a list of plan items, each with a step and status.
When mode is patch, provide step index and status only.
At most one step can be in_progress at a time.`,
  parameters: z
    .object({
      mode: planUpdateModeSchema.optional().default("full"),
      actionName: z
      .string()
      .optional()
        .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：同步当前计划。"),
      explanation: z.string().optional().describe("Optional plan summary."),
      plan: z.array(planUpdateItemSchema).min(1).describe("Plan step list."),
    })
    .superRefine((value, ctx) => {
      const mode = value.mode ?? "full";
      for (let index = 0; index < value.plan.length; index += 1) {
        const item = value.plan[index];
        if (!item) continue;
        if (mode === "patch") {
          if (typeof item.index !== "number") {
            // 中文注释：patch 模式必须提供序号，用于定位更新项。
            ctx.addIssue({
              code: "custom",
              path: ["plan", index, "index"],
              message: "Patch mode requires plan item index.",
            });
          }
        } else if (!item.step) {
          // 中文注释：full 模式必须提供 step 文本。
          ctx.addIssue({
            code: "custom",
            path: ["plan", index, "step"],
            message: "Full mode requires plan item step.",
          });
        }
      }
    }),
  component: null,
} as const;

export const jsReplToolDef = {
  id: "js-repl",
  name: "JavaScript REPL",
  description: `触发：当你需要执行 JavaScript 代码进行计算、数据处理、原型验证或调试时调用。用途：在持久化的 Node.js 沙箱中执行代码，变量和函数在多次调用间保留。返回：console.log 输出和最终表达式的值。不适用：需要访问文件系统或网络请求时请用 Bash。

Executes JavaScript code in a persistent Node.js VM sandbox.
- Variables and functions persist across calls within the same session.
- console.log/warn/error output is captured and returned.
- The last expression value is included in the output.
- Execution has a timeout to prevent infinite loops.
- No access to file system, network, or child_process.`,
  parameters: z.object({
    code: z.string().min(1).describe("要执行的 JavaScript 代码。"),
  }),
  component: null,
} as const;

export const jsReplResetToolDef = {
  id: "js-repl-reset",
  name: "重置 JavaScript REPL",
  description: `触发：当你需要清除 REPL 中所有已定义的变量和状态，恢复到初始环境时调用。用途：重置沙箱上下文。返回：{ ok: true, message: string }。不适用：不需要清除状态时不要调用。

Resets the JavaScript REPL sandbox to a clean state, clearing all variables and functions.`,
  parameters: z.object({}),
  component: null,
} as const;

/** Plan step status type for update-plan payloads. */
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>;

/** Plan step item type for update-plan payloads. */
export type PlanItem = z.infer<typeof planItemSchema>;

/** Plan step patch item type for update-plan payloads. */
export type PlanPatchItem = z.infer<typeof planPatchItemSchema>;

/** Update-plan payload type for update-plan tool. */
export type UpdatePlanArgs = z.infer<typeof updatePlanToolDef.parameters>;
