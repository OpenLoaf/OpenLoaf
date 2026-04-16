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

// Runtime tool approval policy lives in the server tool implementations; API defs only describe params and display info.

export const bashToolDef = {
  id: "Bash",
  readonly: false,
  name: "Run Command",
  description: `Execute a bash command and return its output.

Working directory persists between calls; shell state does not.

Prefer dedicated tools over shell commands: Glob (instead of find/ls), Grep (instead of grep/rg), Read (instead of cat/head/tail), Edit (instead of sed/awk), Write (instead of echo >/heredoc).

Quote paths with spaces. Prefer absolute paths. Default timeout 120s, max 600s.`,
  parameters: z.object({
    command: z.string().min(1),
    description: z.string().optional().describe("Short description of what this command does."),
    timeout: z.number().int().min(1000).max(600000).optional().describe("Milliseconds."),
    run_in_background: z.boolean().optional().describe("Run in background and return immediately."),
  }),
  component: null,
} as const;

export const powerShellToolDef = {
  id: "PowerShell",
  readonly: false,
  name: "Run PowerShell",
  description: `Execute a PowerShell command (Windows equivalent of Bash). Use PowerShell cmdlet syntax — NOT Unix syntax.

Prefer dedicated tools: Glob (not Get-ChildItem -Recurse), Grep (not Select-String), Read (not Get-Content), Edit / Write (not Set-Content / Out-File).

Syntax reminders: \`-and\` / \`-or\` not \`&&\` / \`||\` (PS 5.1 has no \`&&\`); single-quote paths with spaces or non-ASCII characters; prefer absolute paths. Default timeout 120s, max 600s.`,
  parameters: z.object({
    command: z.string().min(1),
    description: z.string().optional().describe("Short description of what this command does."),
    timeout: z.number().int().min(1000).max(600000).optional().describe("Milliseconds."),
    run_in_background: z.boolean().optional().describe("Run in background and return immediately."),
  }),
  component: null,
} as const;

export const readToolDef = {
  id: "Read",
  readonly: true,
  name: "Read File",
  description: `Read any file from the local filesystem — unified dispatcher.

Output is XML-tagged: <system-tag type="fileInfo" toolName="Read"> carries <file>, <meta>, optional <note>/<suggest>/<fallback>/<error>; the raw or extracted body follows the closing tag.

Format handling:
- Text / code / config (.ts/.md/.json/.yaml/...) → numbered lines; use offset/limit for ranges
- PDF / DOCX / XLSX / PPTX → fast local preview only (page count / sheet list / slide titles / first-page snippet). For the full Markdown body + extracted images use the DocPreview tool with mode='full'.
- Image / Video / Audio → local metadata only (dimensions / bytes). Read will NOT call any paid SaaS understanding — the response includes a <suggest skill="cloud-media-skill"> hint; to OCR / transcribe / caption media, SkillLoad cloud-media-skill and follow its playbook.
- Directories → not supported; use Glob or Bash ls

Large-file caution: default returns the first 2000 lines — excess is silently truncated (you see incomplete content but think it is complete). For large files, Grep to locate the target line first, then Read with offset/limit to fetch only the relevant slice.

file_path must be absolute or resolvable from the project root.`,
  parameters: z.object({
    file_path: z.string().min(1).describe("Absolute or project-relative path."),
    offset: z.number().int().min(1).optional().describe("Text files only — line number to start reading from."),
    limit: z.number().int().min(1).optional().describe("Text files only — max lines to return."),
  }),
  component: null,
} as const;

export const editToolDef = {
  id: "Edit",
  readonly: false,
  name: "Edit File",
  description: `Perform an exact string replacement in a file.

- You must Read the file at least once before editing it.
- old_string must match the file content byte-for-byte (including whitespace, indentation, newlines). Writing old_string from memory is the #1 cause of failure — always copy from a fresh Read.
- old_string must be unique in the file. If multiple matches exist, include surrounding lines for disambiguation, or set replace_all: true when every occurrence should change.
- old_string and new_string must differ.
- Prefer Edit over Write when modifying existing files.`,
  parameters: z.object({
    file_path: z.string().min(1).describe("Absolute path."),
    old_string: z.string().min(1),
    new_string: z.string().describe("Must differ from old_string."),
    replace_all: z.boolean().optional().default(false),
  }),
  component: null,
} as const;

export const writeToolDef = {
  id: "Write",
  readonly: false,
  name: "Write File",
  description: `Write a file to the local filesystem (overwrites if it exists).

- For existing files, you must Read them first.
- Prefer Edit for modifying existing files; use Write only for new files or full rewrites.`,
  parameters: z.object({
    file_path: z.string().min(1).describe("Absolute path."),
    content: z.string(),
  }),
  component: null,
} as const;

export const editDocumentToolDef = {
  id: "EditDocument",
  readonly: false,
  name: "Edit Document",
  description:
    "Write the full updated MDX content to a document's `index.mdx` (inside a `tndoc_` folder). This is a full overwrite, not a diff — you must provide the complete MDX body. Read the document first to get its current content, modify as needed, then write the entire result. For regular files use Edit/Write instead.",
  parameters: z.object({
    path: z.string().min(1).describe("Document folder or index.mdx path (relative to project / global root)."),
    content: z.string().describe("Full updated MDX content."),
  }),
  component: null,
} as const;

export const globToolDef = {
  id: "Glob",
  readonly: true,
  name: "Find Files",
  description: `Fast file pattern matching.

- Supports glob patterns like "**/*.js" or "src/**/*.ts".
- Returns paths sorted by modification time.
- Use this to find files by name. For open-ended searches requiring multiple rounds, use the Agent tool.`,
  parameters: z.object({
    pattern: z.string().min(1),
    path: z.string().optional().describe("Defaults to project root."),
  }),
  component: null,
} as const;

export const grepToolDef = {
  id: "Grep",
  readonly: true,
  name: "Search Content",
  description: `Ripgrep-based content search.

- Supports full regex syntax.
- Filter files with glob or type.
- Output modes: "files_with_matches" (default), "content", "count".
- Literal braces need escaping (use \`interface\\{\\}\`).
- For cross-line patterns enable multiline.`,
  parameters: z.object({
    pattern: z.string().min(1),
    path: z.string().optional().describe("Defaults to project root."),
    glob: z.string().optional().describe('e.g. "*.js", "*.{ts,tsx}".'),
    type: z.string().optional().describe('e.g. "js", "py", "rust", "go".'),
    output_mode: z.enum(["content", "files_with_matches", "count"]).optional().describe('Default "files_with_matches".'),
    "-A": z.number().optional().describe("Lines after each match (content mode)."),
    "-B": z.number().optional().describe("Lines before each match (content mode)."),
    "-C": z.number().optional().describe("Lines of context around each match (content mode)."),
    "-n": z.boolean().optional().describe("Show line numbers (content mode). Default true."),
    "-i": z.boolean().optional().describe("Case-insensitive."),
    head_limit: z.number().optional().describe("First N entries. Default 250."),
    offset: z.number().optional().describe("Skip first N entries before head_limit."),
    multiline: z.boolean().optional().describe("Default false."),
  }),
  component: null,
} as const;

/** Submit-plan tool definition — lightweight approval gate for plan files. */
export const submitPlanToolDef = {
  id: "SubmitPlan",
  readonly: true,
  name: "Submit Plan",
  description: `Submit a plan file for user approval.

- The plan subagent writes PLAN_N.md via SavePlanDraft and returns the path — pass that exact path here. Do NOT write PLAN files yourself with Write.
- Only use this when the task requires planning code-writing steps. Do NOT use for research/exploration tasks — just execute directly.
- Do NOT use AskUserQuestion to ask "is this plan okay?" — SubmitPlan already requests approval.`,
  parameters: z.object({
    planFilePath: z
      .string()
      .min(1)
      .describe('From SavePlanDraft; relative paths like "PLAN_1.md" are supported.'),
  }),
  component: null,
} as const;

/** Submit-plan payload type. */
export type SubmitPlanArgs = z.infer<typeof submitPlanToolDef.parameters>;

/** Save-plan-draft tool definition — used exclusively by the plan subagent to
 * persist its designed plan to a PLAN_N.md file and return the path to the
 * parent agent for approval via SubmitPlan. */
export const savePlanDraftToolDef = {
  id: "SavePlanDraft",
  readonly: false,
  name: "Save Plan Draft",
  description: `Save a plan draft to PLAN_N.md (auto-numbered) for the current session.

Call this once at the end of planning, after you have explored the codebase and designed a concrete step-by-step approach. The tool writes a plan file with YAML front-matter and machine-readable steps, then returns the file path and plan number.

After calling this, your turn ENDS. Respond with only a brief summary (plan path, step count, critical files). The parent agent then calls SubmitPlan(planFilePath); do NOT call SubmitPlan yourself.`,
  parameters: z.object({
    actionName: z.string().min(1).max(60).describe("Short plan title."),
    explanation: z
      .string()
      .optional()
      .describe("Approach rationale, trade-offs, or architectural notes."),
    steps: z
      .array(z.string().min(1))
      .min(1)
      .describe("Ordered implementation steps, one sentence each."),
  }),
  component: null,
} as const;

/** Save-plan-draft payload type. */
export type SavePlanDraftArgs = z.infer<typeof savePlanDraftToolDef.parameters>;

/** Plan step item with tracking status. */
export type PlanItem = {
  step: string;
  status: "pending" | "in_progress" | "completed" | "failed";
};
