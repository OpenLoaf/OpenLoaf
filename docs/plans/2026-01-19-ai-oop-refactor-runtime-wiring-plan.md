# AI OOP Runtime Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy AI pipeline with the OOP layered stack as the only runtime path for `/ai/execute`, preserving all current behaviors.

**Architecture:** Keep the existing runtime behavior but move control flow into `AiExecuteController` and `AiExecuteService`, with shared helpers relocated from `ai/pipeline` into `application` and `domain` modules. Delete the legacy pipeline after all imports point to the new locations.

**Tech Stack:** Hono, AI SDK v6, Prisma, existing chat stream services.

**Note:** Project rule overrides TDD here. Skip test-first steps and use smoke verification steps instead. Do not create a worktree.

### Task 1: Move pipeline DTOs and helpers into layered modules

**Files:**
- Create: `apps/server/src/ai/application/dto/aiTypes.ts`
- Modify: `apps/server/src/ai/domain/services/CommandParser.ts`
- Modify: `apps/server/src/ai/domain/services/SkillSelector.ts`
- Create: `apps/server/src/ai/application/services/messageConverter.ts`

**Step 1: Create dto types for ai execute requests**

Create `apps/server/src/ai/application/dto/aiTypes.ts`:

```ts
import type { ChatModelSource } from "@tenas-ai/api/common/modelTypes";
import type { ChatCommandId } from "@tenas-ai/api/common/chatCommands";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { SkillMatch } from "@/ai/domain/services/SkillSelector";

export type AiIntent = "chat" | "image" | "command" | "utility";

export type AiResponseMode = "stream" | "json";

export type AiExecuteRequest = {
  /** Session id for history access. */
  sessionId?: string;
  /** Request id from client transport. */
  id?: string;
  /** Incoming UI messages. */
  messages?: TenasUIMessage[];
  /** Extra parameters from UI. */
  params?: Record<string, unknown>;
  /** Current tab id for UI actions. */
  tabId?: string;
  /** AI SDK transport trigger. */
  trigger?: string;
  /** Message id for regenerate. */
  messageId?: string;
  /** Retry flag for regenerate. */
  retry?: boolean;
  /** Selected chat model id. */
  chatModelId?: string;
  /** Selected chat model source. */
  chatModelSource?: ChatModelSource;
  /** Stable client id for session. */
  clientId?: string;
  /** Board id for chat context. */
  boardId?: string;
  /** Workspace id for context lookup. */
  workspaceId?: string;
  /** Project id for context lookup. */
  projectId?: string;
  /** Image save directory for image requests. */
  imageSaveDir?: string;
  /** Execution intent. */
  intent?: AiIntent;
  /** Response format. */
  responseMode?: AiResponseMode;
};

export type AiCommandContext = {
  /** Stable command id. */
  id: ChatCommandId;
  /** Raw command token. */
  token: string;
  /** Raw user input. */
  rawText: string;
  /** Argument text after token. */
  argsText?: string;
};

export type AiSkillContext = {
  /** Skill names requested by user. */
  names: string[];
  /** Resolved skills injected into prompt. */
  matches: SkillMatch[];
};
```

**Step 2: Implement command parser in domain service**

Replace `apps/server/src/ai/domain/services/CommandParser.ts` with:

```ts
import { CHAT_COMMANDS } from "@tenas-ai/api/common/chatCommands";
import type { ChatCommandId } from "@tenas-ai/api/common/chatCommands";
import type { AiCommandContext } from "@/ai/application/dto/aiTypes";

export type CommandDef = {
  id: ChatCommandId;
  token: string;
};

const COMMAND_REGISTRY: CommandDef[] = CHAT_COMMANDS.map((command) => ({
  id: command.id,
  token: command.command,
}));

const COMMAND_REGISTRY_BY_TOKEN = new Map(
  COMMAND_REGISTRY.map((command) => [command.token, command]),
);

export class CommandParser {
  /** Parse a command only when it appears at the start of input text. */
  static parseCommandAtStart(text: string): AiCommandContext | null {
    const rawText = typeof text === "string" ? text : "";
    const trimmed = rawText.trimStart();
    if (!trimmed.startsWith("/")) return null;
    const firstSpaceIndex = trimmed.search(/\s/u);
    const token = firstSpaceIndex === -1 ? trimmed : trimmed.slice(0, firstSpaceIndex);
    const command = COMMAND_REGISTRY_BY_TOKEN.get(token);
    if (!command) return null;
    const argsText = trimmed.slice(token.length).trim();
    return {
      id: command.id,
      token: command.token,
      rawText,
      argsText: argsText || undefined,
    };
  }
}

export function parseCommandAtStart(text: string): AiCommandContext | null {
  return CommandParser.parseCommandAtStart(text);
}
```

**Step 3: Implement skill selector in domain service**

Replace `apps/server/src/ai/domain/services/SkillSelector.ts` with:

```ts
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import {
  readSkillContentFromPath,
  readSkillSummaryFromPath,
} from "@/ai/agents/masterAgent/skillsLoader";

const TENAS_META_DIR = ".tenas";
const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_NAME = "SKILL.md";

export type SkillScope = "project" | "parent" | "workspace";

export type SkillMatch = {
  name: string;
  path: string;
  scope: SkillScope;
  content: string;
};

export type SkillRoots = {
  projectRoot?: string;
  parentRoots?: string[];
  workspaceRoot?: string;
};

type SkillSearchRoot = {
  scope: SkillScope;
  rootPath: string;
};

export class SkillSelector {
  /** Resolve a skill by name from the ordered roots. */
  static async resolveSkillByName(
    name: string,
    roots: SkillRoots,
  ): Promise<SkillMatch | null> {
    const normalizedName = normalizeSkillName(name);
    if (!normalizedName) return null;
    const searchRoots = buildSearchRoots(roots);

    for (const searchRoot of searchRoots) {
      const skillsRootPath = path.join(searchRoot.rootPath, TENAS_META_DIR, SKILLS_DIR_NAME);
      const skillFiles = findSkillFiles(skillsRootPath);
      for (const filePath of skillFiles) {
        const summary = readSkillSummaryFromPath(
          filePath,
          searchRoot.scope === "workspace" ? "workspace" : "project",
        );
        if (!summary) continue;
        if (normalizeSkillName(summary.name) !== normalizedName) continue;
        const content = readSkillContentFromPath(filePath);
        return {
          name: summary.name,
          path: filePath,
          scope: searchRoot.scope,
          content,
        };
      }
    }

    return null;
  }

  /** Extract ordered skill names from user text. */
  static extractSkillNamesFromText(text: string): string[] {
    const matches = text.matchAll(/\/skill\/([^\s]+)/gu);
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const match of matches) {
      const rawName = match[1] ?? "";
      const name = rawName.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(name);
    }
    return ordered;
  }
}

function buildSearchRoots(roots: SkillRoots): SkillSearchRoot[] {
  const projectRoot = normalizeRootPath(roots.projectRoot);
  const parentRoots = normalizeRootPathList(roots.parentRoots);
  const workspaceRoot = normalizeRootPath(roots.workspaceRoot);
  const ordered: SkillSearchRoot[] = [];

  if (projectRoot) {
    ordered.push({ scope: "project", rootPath: projectRoot });
  }
  for (const parentRoot of parentRoots) {
    ordered.push({ scope: "parent", rootPath: parentRoot });
  }
  if (workspaceRoot) {
    ordered.push({ scope: "workspace", rootPath: workspaceRoot });
  }
  return ordered;
}

function normalizeRootPath(value?: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRootPathList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => normalizeRootPath(value))
    .filter((value): value is string => Boolean(value));
  const unique = new Set<string>();
  const deduped = normalized.filter((value) => {
    if (unique.has(value)) return false;
    unique.add(value);
    return true;
  });
  return deduped;
}

function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

function findSkillFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...findSkillFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
      files.push(entryPath);
    }
  }

  return files;
}
```

**Step 4: Add message converter service**

Create `apps/server/src/ai/application/services/messageConverter.ts`:

```ts
import {
  convertToModelMessages,
  validateUIMessages,
  type UIMessage,
  type ToolSet,
} from "ai";

/** Convert UI messages into model messages with custom data-part handling. */
export async function buildModelMessages(messages: UIMessage[], tools?: ToolSet) {
  validateUIMessages({ messages: messages as any });
  return convertToModelMessages(messages as any, {
    tools,
    convertDataPart: (part) => {
      if (part?.type !== "data-skill") return undefined;
      const payload = (part as any).data ?? {};
      const name = typeof payload.name === "string" ? payload.name : "unknown";
      const scope = typeof payload.scope === "string" ? payload.scope : "unknown";
      const path = typeof payload.path === "string" ? payload.path : "unknown";
      const content = typeof payload.content === "string" ? payload.content : "";
      const text = [
        `# Skill: ${name}`,
        `- scope: ${scope}`,
        `- path: ${path}`,
        "<skill>",
        content,
        "</skill>",
      ].join("\n");
      return { type: "text", text };
    },
  });
}
```

**Step 5: Commit**

```bash
git add apps/server/src/ai/application/dto/aiTypes.ts \
  apps/server/src/ai/domain/services/CommandParser.ts \
  apps/server/src/ai/domain/services/SkillSelector.ts \
  apps/server/src/ai/application/services/messageConverter.ts
git commit -m "refactor(ai): move pipeline helpers into layers"
```

### Task 2: Implement AiExecuteService using new helpers

**Files:**
- Modify: `apps/server/src/ai/application/use-cases/AiExecuteService.ts`

**Step 1: Replace AiExecuteService with the new execution flow**

Replace `apps/server/src/ai/application/use-cases/AiExecuteService.ts` with:

```ts
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { ChatStreamRequest } from "@/ai/application/dto/chatStreamTypes";
import type { ChatImageMessageInput, ChatImageRequest } from "@/ai/application/dto/chatImageTypes";
import type { AiExecuteRequest } from "@/ai/application/dto/aiTypes";
import { ChatStreamUseCase } from "@/ai/application/use-cases/ChatStreamUseCase";
import { SummaryTitleUseCase } from "@/ai/application/use-cases/SummaryTitleUseCase";
import { ImageRequestUseCase } from "@/ai/application/use-cases/ImageRequestUseCase";
import {
  getProjectRootPath,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@tenas-ai/api/services/vfsService";
import { resolveParentProjectRootPaths } from "@/ai/utils/projectRoots";
import { CommandParser } from "@/ai/domain/services/CommandParser";
import { SkillSelector, type SkillMatch } from "@/ai/domain/services/SkillSelector";

export type AiExecuteServiceInput = {
  /** Unified AI request payload. */
  request: AiExecuteRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
};

export class AiExecuteService {
  /** Execute unified AI request. */
  async execute(input: AiExecuteServiceInput): Promise<Response> {
    const request = input.request;
    const sessionId = request.sessionId?.trim() ?? "";
    const responseMode = request.responseMode ?? "stream";
    const expectsJson = responseMode === "json";
    if (!sessionId) {
      return createInvalidResponse("请求无效：缺少 sessionId。", expectsJson);
    }
    const messages = Array.isArray(request.messages) ? request.messages : [];
    const lastMessage = messages.at(-1) as TenasUIMessage | undefined;
    if (!lastMessage || !lastMessage.role || !lastMessage.id) {
      return createInvalidResponse("请求无效：缺少最后一条消息。", expectsJson);
    }

    const lastText = extractTextFromParts(lastMessage.parts ?? []);
    const commandContext =
      lastMessage.role === "user" ? CommandParser.parseCommandAtStart(lastText) : null;

    if (commandContext?.id === "summary-title") {
      return new SummaryTitleUseCase().execute({
        request,
        cookies: input.cookies,
        requestSignal: input.requestSignal,
        commandArgs: commandContext.argsText,
      });
    }

    let selectedSkills: string[] = [];
    let enrichedLastMessage = lastMessage;

    if (lastMessage.role === "user" && !commandContext) {
      selectedSkills = SkillSelector.extractSkillNamesFromText(lastText);
      const skillMatches = await resolveSkillMatches({
        names: selectedSkills,
        request,
      });
      if (skillMatches.length > 0) {
        const skillParts = buildSkillParts(skillMatches);
        const nextParts = [
          ...filterNonSkillParts(lastMessage.parts ?? []),
          ...skillParts,
        ];
        enrichedLastMessage = {
          ...lastMessage,
          parts: nextParts,
        };
      }
    }

    if (request.intent === "image" && request.responseMode === "json") {
      const imageRequest = buildChatImageRequest({
        request,
        sessionId,
        lastMessage: enrichedLastMessage,
        selectedSkills,
      });
      const result = await new ImageRequestUseCase().execute({
        request: imageRequest,
        cookies: input.cookies,
        requestSignal: input.requestSignal,
      });
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(result.response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const chatRequest = buildChatStreamRequest({
      request,
      sessionId,
      lastMessage: enrichedLastMessage,
      selectedSkills,
    });
    return new ChatStreamUseCase().execute({
      request: chatRequest,
      cookies: input.cookies,
      requestSignal: input.requestSignal,
    });
  }
}

/** Extract plain text from message parts. */
function extractTextFromParts(parts: unknown[]): string {
  const items = Array.isArray(parts) ? (parts as any[]) : [];
  return items
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

/** Build chat request for streaming pipeline. */
function buildChatStreamRequest(input: {
  request: AiExecuteRequest;
  sessionId: string;
  lastMessage: TenasUIMessage;
  selectedSkills: string[];
}): ChatStreamRequest {
  return {
    sessionId: input.sessionId,
    messages: [input.lastMessage],
    id: input.request.id,
    messageId: input.request.messageId,
    clientId: input.request.clientId,
    tabId: input.request.tabId,
    params: input.request.params,
    trigger: input.request.trigger,
    retry: input.request.retry,
    chatModelId: input.request.chatModelId,
    chatModelSource: input.request.chatModelSource,
    workspaceId: input.request.workspaceId,
    projectId: input.request.projectId,
    boardId: input.request.boardId,
    selectedSkills: input.selectedSkills,
  };
}

/** Build chat request for image pipeline. */
function buildChatImageRequest(input: {
  request: AiExecuteRequest;
  sessionId: string;
  lastMessage: TenasUIMessage;
  selectedSkills: string[];
}): ChatImageRequest {
  const imageMessage: ChatImageMessageInput = {
    ...input.lastMessage,
    parentMessageId: input.lastMessage.parentMessageId ?? null,
  };
  return {
    sessionId: input.sessionId,
    messages: [imageMessage],
    id: input.request.id,
    messageId: input.request.messageId,
    clientId: input.request.clientId,
    tabId: input.request.tabId,
    params: input.request.params,
    trigger: input.request.trigger,
    retry: input.request.retry,
    chatModelId: input.request.chatModelId ?? "",
    chatModelSource: input.request.chatModelSource,
    workspaceId: input.request.workspaceId,
    projectId: input.request.projectId,
    boardId: input.request.boardId ?? null,
    imageSaveDir: input.request.imageSaveDir,
    selectedSkills: input.selectedSkills,
  };
}

/** Resolve skill matches for a request. */
async function resolveSkillMatches(input: {
  names: string[];
  request: AiExecuteRequest;
}): Promise<SkillMatch[]> {
  if (input.names.length === 0) return [];
  const projectRoot = input.request.projectId
    ? getProjectRootPath(input.request.projectId) ?? undefined
    : undefined;
  const workspaceRootFromId = input.request.workspaceId
    ? getWorkspaceRootPathById(input.request.workspaceId)
    : null;
  const workspaceRoot = workspaceRootFromId ?? getWorkspaceRootPath() ?? undefined;
  const parentRoots = await resolveParentProjectRootPaths(input.request.projectId);
  const matches: SkillMatch[] = [];
  for (const name of input.names) {
    const match = await SkillSelector.resolveSkillByName(name, {
      projectRoot,
      parentRoots,
      workspaceRoot,
    });
    if (match) matches.push(match);
  }
  return matches;
}

/** Filter non-skill parts from a message. */
function filterNonSkillParts(parts: unknown[]): unknown[] {
  const items = Array.isArray(parts) ? parts : [];
  return items.filter((part) => part && (part as any).type !== "data-skill");
}

/** Build data-skill parts. */
function buildSkillParts(matches: SkillMatch[]) {
  return matches.map((match) => ({
    type: "data-skill" as const,
    data: {
      name: match.name,
      path: match.path,
      scope: match.scope,
      content: match.content,
    },
  }));
}

type CommandDataPart = {
  type: string;
  data: Record<string, unknown>;
};

/** Create a minimal stream response for command execution. */
function createCommandStreamResponse(input: {
  dataParts: CommandDataPart[];
  errorText?: string;
}): Response {
  if (input.errorText) {
    const body = [
      toSseChunk({ type: "start" }),
      toSseChunk({ type: "text-start", id: "error" }),
      toSseChunk({ type: "text-delta", id: "error", delta: input.errorText }),
      toSseChunk({ type: "text-end", id: "error" }),
      toSseChunk({ type: "finish", finishReason: "error" }),
    ].join("");
    return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const enqueueChunk = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      for (const part of input.dataParts) {
        enqueueChunk(
          toSseChunk({
            type: part.type,
            data: part.data,
            transient: true,
          }),
        );
      }
      enqueueChunk(toSseChunk({ type: "finish", finishReason: "stop" }));
      controller.close();
    },
  });
  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/** Convert JSON payload into SSE chunk. */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

/** Build an invalid request response by response mode. */
function createInvalidResponse(errorText: string, expectsJson: boolean): Response {
  if (expectsJson) {
    return new Response(JSON.stringify({ error: errorText }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return createCommandStreamResponse({ dataParts: [], errorText });
}
```

**Step 2: Commit**

```bash
git add apps/server/src/ai/application/use-cases/AiExecuteService.ts
git commit -m "refactor(ai): route execute through service"
```

### Task 3: Wire controller, module, and route

**Files:**
- Modify: `apps/server/src/ai/interface/controllers/AiExecuteController.ts`
- Modify: `apps/server/src/ai/composition/AiModule.ts`
- Modify: `apps/server/src/ai/interface/routes/aiExecuteRoutes.ts`

**Step 1: Implement AiExecuteController**

Replace `apps/server/src/ai/interface/controllers/AiExecuteController.ts` with:

```ts
import type { AiExecuteRequest } from "@/ai/application/dto/aiTypes";
import { AiExecuteService } from "@/ai/application/use-cases/AiExecuteService";

type AiExecuteControllerDeps = {
  executeService: AiExecuteService;
};

export class AiExecuteController {
  constructor(private readonly deps: AiExecuteControllerDeps) {}

  /** Execute AI request. */
  execute(input: {
    request: AiExecuteRequest;
    cookies: Record<string, string>;
    requestSignal: AbortSignal;
  }) {
    return this.deps.executeService.execute(input);
  }
}
```

**Step 2: Implement AiModule**

Replace `apps/server/src/ai/composition/AiModule.ts` with:

```ts
import { AiExecuteService } from "@/ai/application/use-cases/AiExecuteService";
import { AiExecuteController } from "@/ai/interface/controllers/AiExecuteController";

/** AI module composition root. */
export class AiModule {
  /** Build the execute controller with its dependencies. */
  createAiExecuteController(): AiExecuteController {
    return new AiExecuteController({ executeService: this.createAiExecuteService() });
  }

  private createAiExecuteService(): AiExecuteService {
    return new AiExecuteService();
  }
}
```

**Step 3: Wire route to controller**

Update `apps/server/src/ai/interface/routes/aiExecuteRoutes.ts`:

```ts
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ChatModelSource } from "@tenas-ai/api/common";
import type { AiExecuteRequest, AiIntent, AiResponseMode } from "@/ai/application/dto/aiTypes";
import { AiModule } from "@/ai/composition/AiModule";
import { logger } from "@/common/logger";
import { toText } from "@/routers/route-utils";

const controller = new AiModule().createAiExecuteController();

/** Register unified AI execute route. */
export function registerAiExecuteRoutes(app: Hono) {
  app.post("/ai/execute", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = parseAiExecuteRequest(body);
    if (!parsed.request) {
      return c.json({ error: parsed.error ?? "Invalid request" }, 400);
    }

    logger.debug(
      {
        request: parsed.request,
      },
      "[ai] /ai/execute request",
    );

    const cookies = getCookie(c) || {};
    return controller.execute({
      request: parsed.request,
      cookies,
      requestSignal: c.req.raw.signal,
    });
  });
}

/** Parse request payload into typed input. */
function parseAiExecuteRequest(body: unknown): { request?: AiExecuteRequest; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const raw = body as Record<string, unknown>;

  const sessionId = toText(raw.sessionId);
  if (!sessionId) return { error: "sessionId is required" };

  const messages = Array.isArray(raw.messages) ? (raw.messages as AiExecuteRequest["messages"]) : [];
  if (!Array.isArray(raw.messages)) return { error: "messages is required" };

  const intent = normalizeIntent(raw.intent);
  if (raw.intent && !intent) return { error: "intent is invalid" };

  const responseMode = normalizeResponseMode(raw.responseMode);
  if (raw.responseMode && !responseMode) return { error: "responseMode is invalid" };

  return {
    request: {
      sessionId,
      messages,
      id: toText(raw.id) || undefined,
      messageId: toText(raw.messageId) || undefined,
      clientId: toText(raw.clientId) || undefined,
      tabId: toText(raw.tabId) || undefined,
      params: normalizeParams(raw.params),
      trigger: toText(raw.trigger) || undefined,
      retry: typeof raw.retry === "boolean" ? raw.retry : undefined,
      chatModelId: toText(raw.chatModelId) || undefined,
      chatModelSource: normalizeChatModelSource(raw.chatModelSource),
      workspaceId: toText(raw.workspaceId) || undefined,
      projectId: toText(raw.projectId) || undefined,
      boardId: toText(raw.boardId) || undefined,
      imageSaveDir: toText(raw.imageSaveDir) || undefined,
      intent: intent ?? "chat",
      responseMode: responseMode ?? "stream",
    },
  };
}

/** Normalize params input. */
function normalizeParams(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Normalize chat model source input. */
function normalizeChatModelSource(value: unknown): ChatModelSource | undefined {
  return value === "cloud" ? "cloud" : value === "local" ? "local" : undefined;
}

function normalizeIntent(value: unknown): AiIntent | undefined {
  return value === "chat" || value === "image" || value === "command" || value === "utility"
    ? value
    : undefined;
}

function normalizeResponseMode(value: unknown): AiResponseMode | undefined {
  return value === "stream" || value === "json" ? value : undefined;
}
```

**Step 4: Commit**

```bash
git add apps/server/src/ai/interface/controllers/AiExecuteController.ts \
  apps/server/src/ai/composition/AiModule.ts \
  apps/server/src/ai/interface/routes/aiExecuteRoutes.ts
git commit -m "refactor(ai): wire execute controller"
```

### Task 4: Update remaining imports to new locations

**Files:**
- Modify: `apps/server/src/ai/application/services/chatStream/chatStreamService.ts`
- Modify: `apps/server/src/ai/application/services/chatStream/streamOrchestrator.ts`
- Modify: `apps/server/src/ai/application/use-cases/SummaryTitleUseCase.ts`

**Step 1: Update command parser import**

Replace the import in `apps/server/src/ai/application/services/chatStream/chatStreamService.ts`:

```ts
-import { parseCommandAtStart } from "@/ai/pipeline/commandParser";
+import { parseCommandAtStart } from "@/ai/domain/services/CommandParser";
```

**Step 2: Update message converter import**

Replace the import in `apps/server/src/ai/application/services/chatStream/streamOrchestrator.ts`:

```ts
-import { buildModelMessages } from "@/ai/pipeline/messageConverter";
+import { buildModelMessages } from "@/ai/application/services/messageConverter";
```

**Step 3: Update SummaryTitleUseCase imports**

Replace the imports in `apps/server/src/ai/application/use-cases/SummaryTitleUseCase.ts`:

```ts
-import type { AiExecuteRequest } from "@/ai/pipeline/aiTypes";
+import type { AiExecuteRequest } from "@/ai/application/dto/aiTypes";
```

```ts
-import { buildModelMessages } from "@/ai/pipeline/messageConverter";
+import { buildModelMessages } from "@/ai/application/services/messageConverter";
```

**Step 4: Commit**

```bash
git add apps/server/src/ai/application/services/chatStream/chatStreamService.ts \
  apps/server/src/ai/application/services/chatStream/streamOrchestrator.ts \
  apps/server/src/ai/application/use-cases/SummaryTitleUseCase.ts
git commit -m "refactor(ai): update imports after pipeline move"
```

### Task 5: Remove legacy pipeline modules

**Files:**
- Delete: `apps/server/src/ai/pipeline/aiPipeline.ts`
- Delete: `apps/server/src/ai/pipeline/aiTypes.ts`
- Delete: `apps/server/src/ai/pipeline/commandParser.ts`
- Delete: `apps/server/src/ai/pipeline/commandRegistry.ts`
- Delete: `apps/server/src/ai/pipeline/messageConverter.ts`
- Delete: `apps/server/src/ai/pipeline/skillRegistry.ts`
- Delete: `apps/server/src/ai/pipeline/skillResolver.ts`

**Step 1: Remove pipeline directory**

```bash
rm -rf apps/server/src/ai/pipeline
```

**Step 2: Commit**

```bash
git add -A apps/server/src/ai/pipeline
git commit -m "refactor(ai): remove legacy pipeline"
```

### Task 6: Verify and finalize

**Files:**
- Verify: `apps/server/src`

**Step 1: Ensure no pipeline imports remain**

Run: `rg -n "@/ai/pipeline" apps/server/src`
Expected: no matches

**Step 2: Optional type check**

Run: `pnpm check-types`
Expected: PASS (or fix any new type errors in the touched files only)

**Step 3: Commit verification fixes (if any)**

```bash
git add apps/server/src
git commit -m "fix(ai): address post-migration type issues"
```
