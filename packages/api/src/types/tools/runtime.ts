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

🚫 **Office/PDF files** (.xlsx / .xlsm / .csv / .docx / .pptx / .pdf): do NOT read or write them with \`python\` + \`openpyxl\` / \`pandas\` / \`xlrd\` / \`python-docx\` / \`pdfplumber\` / \`pypdf\` / \`python-pptx\`, nor with \`node\` + \`exceljs\` / \`xlsx\` / \`mammoth\`. Use the dedicated tools instead: \`DocPreview\` (read-only preview / full Markdown extraction, works on all four types), \`ExcelInspect\` (spreadsheets, read-only), \`WordInspect\` (docx, read-only), \`PdfInspect\` (pdf, read-only), \`PptxInspect\` (pptx, read-only), \`DocConvert\` (format conversion), \`JsSandbox\` (create / edit / generate any Office or PDF file). Bash scripts bypass the approval gate, preview UI, and session asset-dir resolution.

Quote paths with spaces. Prefer absolute paths. Default timeout 120s, max 600s.`,
  parameters: z.object({
    command: z.string().min(1),
    description: z.string().optional().describe("Short description of what this command does."),
    timeout: z.number().int().min(1000).max(600000).optional().describe("Milliseconds."),
    run_in_background: z.boolean().optional().describe("Run in background and return immediately. Write the command as if it runs in the foreground — the tool handles backgrounding; do NOT add & or nohup yourself. Returns a task_id — manage it with Kill (terminate), Jobs (list status), and Sleep (wait for completion notification). Do NOT use shell kill/jobs commands; use the Kill/Jobs tools instead."),
  }),
  component: null,
} as const;

export const powerShellToolDef = {
  id: "PowerShell",
  readonly: false,
  name: "Run PowerShell",
  description: `Execute a PowerShell command (Windows equivalent of Bash). Use PowerShell cmdlet syntax — NOT Unix syntax.

Prefer dedicated tools: Glob (not Get-ChildItem -Recurse), Grep (not Select-String), Read (not Get-Content), Edit / Write (not Set-Content / Out-File).

🚫 **Office/PDF files**: same rule as Bash — do NOT invoke \`python\` / \`node\` with \`openpyxl\` / \`pandas\` / \`python-docx\` / \`pdfplumber\` / \`exceljs\` etc. to read or write \`.xlsx / .docx / .pptx / .pdf\` / \`.csv\`. Use \`DocPreview\` / \`ExcelInspect\` / \`WordInspect\` / \`PdfInspect\` / \`PptxInspect\` / \`DocConvert\` (read-only / conversion) or \`JsSandbox\` (create / edit / generate) instead.

Syntax reminders: \`-and\` / \`-or\` not \`&&\` / \`||\` (PS 5.1 has no \`&&\`); single-quote paths with spaces or non-ASCII characters; prefer absolute paths. Default timeout 120s, max 600s.`,
  parameters: z.object({
    command: z.string().min(1),
    description: z.string().optional().describe("Short description of what this command does."),
    timeout: z.number().int().min(1000).max(600000).optional().describe("Milliseconds."),
    run_in_background: z.boolean().optional().describe("Run in background and return immediately. Write the command as if it runs in the foreground — the tool handles backgrounding; do NOT add & or Start-Process yourself. Returns a task_id — manage it with Kill (terminate), Jobs (list status), and Sleep (wait for completion notification). Do NOT use shell kill/jobs commands; use the Kill/Jobs tools instead."),
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
- Image (PNG/JPG/WebP/...) → behavior depends on model capability (check the trailing <system-tag type="msg-context"> native-inputs):
    • Vision-capable model (native-inputs includes "image"): Read returns a <system-tag type="attachment" path="..." media-type="..."/> tag. At the very next step the runtime injects the image as a native part via a follow-up user message so you see it directly. This is the preferred path for inspecting rendered slides (PptxInspect render → imagePath → Read).
    • Non-vision model: Read returns local metadata only (dimensions / format) plus a <suggest skill="cloud-media-skill"> hint; to OCR / caption the image call CloudImageUnderstand instead.
    • HARD RULE — anti-hallucination: after Read on an image, the only valid visual claims are those you can confirm from the native image part the runtime just injected (vision model) or from a CloudImageUnderstand response (non-vision model). If neither channel produced content you can observe, STOP. Do NOT emit specific numbers, labels, region names, axis values, or chart data. Either say "I cannot see the image content" or re-dispatch through the correct channel — NEVER infer visual content from the filename, slide title, or surrounding text.
- Video / Audio → local metadata only (bytes / format). To transcribe / caption, SkillLoad cloud-media-skill and follow its playbook.
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
- Only use this when the task requires planning code-writing steps. Do NOT use for research/exploration tasks — just execute directly.`,
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

// ───────── macOS Control Tools ─────────

/** Reference to an AX UI element, either by path-from-root or by AX identifier. */
const axRefSchema = z.union([
  z.object({
    app: z.string().min(1).describe("App name or bundle id (e.g. 'Finder', 'com.apple.finder')."),
    path: z
      .array(z.union([z.string(), z.number().int().nonnegative()]))
      .describe(
        "Child-index chain from the app root — copy verbatim from a previous MacosObserve response. Accepts strings (as emitted by observe, e.g. [\"0\",\"3\",\"0\"]) or numbers; the Swift helper parses either.",
      ),
  }),
  z.object({
    identifier: z.string().min(1).describe("AX identifier (AXIdentifier) — stable across window moves."),
  }),
]);

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const macosObserveToolDef = {
  id: "MacosObserve",
  readonly: true,
  name: "Observe macOS",
  description: `Take a screenshot of the main display AND dump the Accessibility tree of the target app.

Use this as the first step in any macOS control loop, and after every MacosAct call, so you can re-observe the UI state before your next action.

Output: an attachment tag pointing at the PNG (vision-capable models will see the image natively) plus a compact JSON AX tree. Each AX node has:
  - role / subrole / title / value / identifier / frame {x,y,w,h}
  - actions[] (e.g. ["AXPress", "AXShowMenu"]) — only present on interactable nodes
  - path: child-index chain from the app root — pass this back as AxRef when calling MacosAct. Only emitted on nodes with actions or identifier to keep the tree small; intermediate groups are unreferenceable by design (reach their actionable descendants instead).
  - shortcut (AXMenuItem nodes only) — pre-rendered key combo like "⌘N" / "⇧⌘Q" / "⌃⌥⌘O". Prefer this over OCR or guessing: if you need "New Tab" in Safari, read the shortcut from the File menu and send it via MacosAct key instead of clicking pixels.

Windows: the tool also returns a \`windows\` list (one entry per renderable window for the target app — each has windowID, title, bounds, isOnScreen, ownerPID). The main screenshot defaults to the frontmost window, but when an app has multiple windows (e.g. WeChat main chat + image preview), OR the main window is covered by another one and the screenshot looks wrong, use MacosCaptureWindow(windowID) to grab each window individually — Window Server preserves composition buffers for covered / off-screen windows, so z-order does not matter.

Requires Screen Recording + Accessibility permissions. If either is missing, the tool returns a structured error; relay the message to the user and ask them to grant access in System Settings → Privacy & Security.`,
  parameters: z.object({
    appFilter: z
      .string()
      .optional()
      .describe(
        "App name or bundle id. When set, both the AX tree AND the screenshot are scoped to that app's frontmost window (smaller image, less noise, no other windows). Omit to observe the frontmost app with a full-display screenshot.",
      ),
    maxNodes: z
      .number()
      .int()
      .min(50)
      .max(5000)
      .optional()
      .describe("Cap on AX tree node count. Default 500."),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("AX tree depth cap. Default 6."),
    includeScreenshot: z
      .boolean()
      .optional()
      .describe("Set false to skip the PNG (AX tree only). Default true."),
    includeWindows: z
      .boolean()
      .optional()
      .describe("Set false to skip the window list. Default true."),
  }),
  component: null,
} as const;

export const macosListWindowsToolDef = {
  id: "MacosListWindows",
  readonly: true,
  name: "List macOS windows",
  description: `Enumerate renderable windows for an app (or the whole system).

Use this when you need to pick a specific window — e.g. an app has multiple windows open (WeChat main + preview, Finder 3 folders, Chrome many tabs), the main window is covered by another one and a full-screen shot would miss it, or you need to figure out which windowID to hand to MacosCaptureWindow.

Returns an array where each entry has: windowID (stable handle), title, bounds {x,y,w,h} in logical screen coords, isOnScreen (false means minimized or covered — still capturable via MacosCaptureWindow), layer (0 = normal app window), ownerPID / ownerName / ownerBundleID.

Faster than MacosObserve when you only need the window list — skips AX traversal and screenshotting.`,
  parameters: z.object({
    appFilter: z
      .string()
      .optional()
      .describe(
        "App display name or bundle id. Omit to list windows across all apps.",
      ),
  }),
  component: null,
} as const;

export const macosSurveyToolDef = {
  id: "MacosSurvey",
  readonly: true,
  name: "Survey macOS app",
  description: `Build a mental model of a macOS app BEFORE you try to drive it. Call this first whenever the user asks you to do something in a desktop app — especially an app you haven't touched yet in this session.

Why this exists: opening an app and immediately clicking is how you end up pressing the red close button on WeChat. MacosObserve shows you the *current* UI state, but it doesn't tell you what the app is *for* or which paths are safe. MacosSurvey answers:
  - what known intents does the registry cover for this app? (e.g. WeChat → open_moments, open_chats)
  - is the AX tree rich (AppKit app, AX path clicks work) or thin (self-drawn UI like WeChat / Figma, AX path clicks will misfire)?
  - what's the menu bar structure, with keyboard shortcuts?
  - what windows are open?
  - what's the recommended execution path for this app?

Output is a text report with sections: \`App\`, \`AX profile\` (richness / verdict), \`Known intents\`, \`Menu bar\`, \`Windows\`, \`Recommended path order\`. Use the Known intents first (call MacosAct type="intent"); fall back to menu_click; use coordinate click / AX path click only when the survey says AX is rich and the target is not a window chrome button.

Cached per session × app for 5 minutes — cheap to call repeatedly; expensive only the first time for a given app.`,
  parameters: z.object({
    app: z
      .string()
      .min(1)
      .describe(
        "App display name (e.g. 'WeChat', 'Safari', '微信') or bundle id (e.g. 'com.tencent.xinWeChat'). Resolved against running apps.",
      ),
    refresh: z
      .boolean()
      .optional()
      .describe(
        "Set true to bypass the 5-minute cache and rebuild the survey (e.g. after the app's locale / layout changed mid-session).",
      ),
  }),
  component: null,
} as const;

export const macosCaptureWindowToolDef = {
  id: "MacosCaptureWindow",
  readonly: true,
  name: "Capture macOS window",
  description: `Screenshot a specific window by windowID, bypassing z-order.

Use this after MacosObserve / MacosListWindows has revealed a windowID you want to see in isolation. Unlike a full-screen grab, this pulls the Window Server's composition buffer for the target window directly — covered, partially-occluded, or off-screen (minimized) windows still capture cleanly.

Returns an attachment tag pointing at the PNG plus the window's frame metadata. Coordinate baseline for subsequent MacosAct calls: the captured image uses the window's own coord space (top-left = window origin), so clicks are converted correctly for you.`,
  parameters: z.object({
    windowID: z
      .number()
      .int()
      .min(0)
      .describe(
        "CGWindowID from a prior MacosObserve / MacosListWindows response. Stable across calls until the window is closed.",
      ),
  }),
  component: null,
} as const;

export const macosActToolDef = {
  id: "MacosAct",
  readonly: false,
  name: "Act on macOS",
  description: `Execute ONE synthetic UI action on the user's Mac. Always call MacosObserve again afterwards to see the result before deciding the next action — do not chain blind.

Coordinate space: all {x,y} points (click.point, scroll.point, drag.from/to) are **screenshot pixels from the most recent MacosObserve** — read them straight off the image. The tool converts pixels → logical screen coords for you. Do NOT try to offset for window position or divide by retina scale; the conversion is automatic. If you have not called MacosObserve yet in this session, coordinate-based actions will fail until you do.

Actions (preferred order: intent → menu_click → key → applescript → click):
  - intent → **HIGHEST CONFIDENCE.** Invoke a known intent from the registry (surfaced by MacosSurvey under "Known intents"). Example: {type:"intent", app:"WeChat", intent:"open_moments"}. The server routes it to the right underlying action (menu_click / applescript / URL). Use this first whenever MacosSurvey lists the intent you want — zero guessing, no pixels.
  - launch_app → open an app by name or bundle id via \`open -a\`. Prefer this over cmd+space/Spotlight for launching — it's one call, deterministic, and doesn't depend on IME focus. Example: {type:"launch_app", app:"WeChat"} or {type:"launch_app", app:"com.tencent.xinWeChat"}
  - menu_click → **PREFERRED for in-app navigation when no intent matches.** Walks the target app's menu bar via Accessibility and triggers the menu item without moving the mouse or synthesizing clicks. Works even for apps with custom-drawn main UI (WeChat/QQ/Feishu/DingTalk/WeCom) because the menu bar is always AX-exposed. Example: {type:"menu_click", app:"WeChat", menuPath:["视图","朋友圈"]}. Try this BEFORE coordinate clicks — it has near-100% success rate when the target item exists.
  - applescript → run AppleScript via \`osascript -e\`. Best for scriptable apps (Finder, Mail, Calendar, Safari, Chrome, Notes, Reminders, Messages, Music, Terminal, iTerm, Keynote). Runs fully in background — no window focus change, no cursor movement. Example: {type:"applescript", code:"tell application \\"Finder\\" to activate"}. Returns stdout; use for data queries too.
  - click   → click at an AxRef or screenshot-pixel {x,y}. Coordinate clicks are LAST RESORT — prefer intent / menu_click / key first, especially for self-drawn UIs. AX path clicks on window chrome buttons (AXCloseButton etc.) are refused — you'll get a WINDOW_CHROME_BLOCKED error pointing you at safer paths.
  - type    → type arbitrary Unicode text (CJK supported) at the current focus
  - key     → press a key chord, e.g. keys: ["cmd","2"]. For in-app navigation this is often more reliable than clicking: it doesn't move the cursor and doesn't depend on pixel coords.
  - scroll  → scroll at a point by {dx,dy} pixels
  - drag    → drag from {x,y} to {x,y}
  - wait    → sleep ms (max 10000)
  - ax_action → call AXUIElementPerformAction with a named AX action on a ref; for standard AXPress consider menu_click instead.

Requires Accessibility permission. Blocked apps (password managers, banking) are refused. Each call auto-settles 150ms before returning so observations that follow see post-reaction UI.`,
  parameters: z.object({
    action: z.preprocess(
      // Some providers (notably Qwen) serialize nested object tool-args as JSON
      // strings. Accept both shapes transparently.
      (v) => {
        if (typeof v !== "string") return v;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      },
      z.discriminatedUnion("type", [
      z.object({
        type: z.literal("intent"),
        app: z.string().min(1).describe(
          "App display name or bundle id matching a MacosSurvey 'Known intents' entry.",
        ),
        intent: z.string().min(1).describe(
          "Intent id from MacosSurvey output, e.g. 'open_moments', 'new_tab'.",
        ),
        args: z.record(z.string(), z.string()).optional().describe(
          "Args required by the intent (see args:[] in the intent definition).",
        ),
      }),
      z.object({
        type: z.literal("launch_app"),
        app: z.string().min(1).describe(
          "App display name (e.g. 'WeChat', 'Finder') or bundle id (e.g. 'com.tencent.xinWeChat'). Resolved by macOS `open -a`.",
        ),
      }),
      z.object({
        type: z.literal("click"),
        ref: axRefSchema.optional(),
        point: pointSchema.optional(),
        button: z.enum(["left", "right"]).optional(),
        clicks: z.number().int().min(1).max(3).optional(),
        confirmWindowChrome: z.boolean().optional().describe(
          "Set true to bypass the safety check that refuses ref-based clicks on window chrome buttons (AXCloseButton / AXMinimizeButton / AXZoomButton / AXFullScreenButton). Only use when you genuinely want to close / minimize / zoom the window.",
        ),
      }),
      z.object({ type: z.literal("type"), text: z.string() }),
      z.object({
        type: z.literal("key"),
        keys: z.array(z.string()).min(1).describe(
          'Modifier + key names, e.g. ["cmd","space"], ["cmd","shift","p"], ["return"].',
        ),
      }),
      z.object({
        type: z.literal("scroll"),
        point: pointSchema,
        dy: z.number(),
        dx: z.number().optional(),
      }),
      z.object({
        type: z.literal("drag"),
        from: pointSchema,
        to: pointSchema,
      }),
      z.object({ type: z.literal("wait"), ms: z.number().int().min(0).max(10000) }),
      z.object({
        type: z.literal("ax_action"),
        ref: axRefSchema,
        action: z.string().describe("AX action name, e.g. AXPress, AXShowMenu, AXRaise."),
      }),
      z.object({
        type: z.literal("menu_click"),
        app: z.string().min(1).describe(
          "App display name (e.g. 'WeChat') or bundle id (e.g. 'com.tencent.xinWeChat').",
        ),
        menuPath: z.array(z.string()).min(1).describe(
          'Menu path from the menu bar down, e.g. ["View","Moments"] or ["视图","朋友圈"]. Use the titles the app actually displays in its current locale.',
        ),
      }),
      z.object({
        type: z.literal("applescript"),
        code: z.string().min(1).describe(
          'AppleScript source, e.g. \'tell application "Finder" to activate\'. Runs via osascript -e. Stdout is returned to you.',
        ),
        timeoutMs: z.number().int().min(100).max(30000).optional().describe(
          "Max runtime in ms (default 10000). Long AppleScripts that wait for UI should pick a realistic ceiling.",
        ),
      }),
      ]),
    ),
  }),
  component: null,
} as const;

export type MacosObserveArgs = z.infer<typeof macosObserveToolDef.parameters>;
export type MacosActArgs = z.infer<typeof macosActToolDef.parameters>;
export type MacosListWindowsArgs = z.infer<typeof macosListWindowsToolDef.parameters>;
export type MacosCaptureWindowArgs = z.infer<typeof macosCaptureWindowToolDef.parameters>;
export type MacosSurveyArgs = z.infer<typeof macosSurveyToolDef.parameters>;
