import { BaseChatRouter, chatSchemas, t, shieldedProcedure, appRouterDefine } from "@teatime-ai/api";
import { deepseek } from "@ai-sdk/deepseek";
import { generateText } from "ai";

const TITLE_MAX_CHARS = 16;
const LEAF_CANDIDATES = 50;
const TITLE_CONTEXT_TAKE = 24;
const TITLE_AGENT_NAME = "session-title-agent";

function isRenderableRow(row: { role: string; parts: unknown }): boolean {
  if (row.role === "user") return true;
  const parts = row.parts;
  return Array.isArray(parts) && parts.length > 0;
}

function getPathPrefixes(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const prefixes: string[] = [];
  for (let i = 0; i < segments.length; i += 1) prefixes.push(segments.slice(0, i + 1).join("/"));
  return prefixes;
}

function extractTextFromParts(parts: unknown): string {
  const arr = Array.isArray(parts) ? (parts as any[]) : [];
  const chunks: string[] = [];
  for (const part of arr) {
    if (!part || typeof part !== "object") continue;
    if (typeof (part as any).text === "string") chunks.push(String((part as any).text));
  }
  return chunks.join("\n").trim();
}

function normalizeTitle(raw: string): string {
  let title = (raw ?? "").trim();
  title = title.replace(/^["'“”‘’《》]+/, "").replace(/["'“”‘’《》]+$/, "");
  title = title.split("\n")[0]?.trim() ?? "";
  if (title.length > TITLE_MAX_CHARS) title = title.slice(0, TITLE_MAX_CHARS);
  return title.trim();
}

async function resolveSessionRightmostLeafId(prisma: any, sessionId: string): Promise<string | null> {
  const candidates = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: [{ path: "desc" }, { id: "desc" }],
    take: LEAF_CANDIDATES,
    select: { id: true, role: true, parts: true },
  });
  for (const row of candidates) {
    if (isRenderableRow(row)) return String(row.id);
  }
  return null;
}

async function loadRightmostChainRows(prisma: any, sessionId: string): Promise<any[]> {
  const leafId = await resolveSessionRightmostLeafId(prisma, sessionId);
  if (!leafId) return [];

  const leaf = await prisma.chatMessage.findUnique({
    where: { id: leafId },
    select: { sessionId: true, path: true },
  });
  if (!leaf || leaf.sessionId !== sessionId) return [];

  const allPaths = getPathPrefixes(String(leaf.path));
  // 只取最近一段链路用于取名，避免超长会话导致 prompt 过大。
  const selectedPaths =
    allPaths.length > TITLE_CONTEXT_TAKE ? allPaths.slice(-TITLE_CONTEXT_TAKE) : allPaths;

  return prisma.chatMessage.findMany({
    where: { sessionId, path: { in: selectedPaths } },
    orderBy: [{ path: "asc" }],
    select: { role: true, parts: true },
  });
}

function buildTitlePrompt(chainRows: Array<{ role: string; parts: unknown }>): string {
  const lines: string[] = [];
  for (const row of chainRows) {
    const text = extractTextFromParts(row.parts);
    if (!text) continue;
    if (row.role === "user") lines.push(`User: ${text}`);
    else if (row.role === "assistant") lines.push(`Assistant: ${text}`);
    else lines.push(`System: ${text}`);
  }
  return lines.join("\n").trim();
}

function createTitleAgent() {
  return {
    name: TITLE_AGENT_NAME,
    model: deepseek("deepseek-chat"),
    system: `
你是一个“对话标题生成器”。
- 只输出一个标题，不要解释。
- 标题不超过 ${TITLE_MAX_CHARS} 个字符。
- 不要输出引号、编号、Markdown。
`,
  } as const;
}

async function generateTitleFromHistory(historyText: string): Promise<string> {
  const agent = createTitleAgent();
  const res = await generateText({
    model: agent.model,
    system: agent.system,
    prompt: `请根据下面的对话内容生成一个简短标题：\n\n${historyText}`,
  });
  return normalizeTitle(res.text);
}

export class ChatRouterImpl extends BaseChatRouter {
  /** Chat tRPC 端点实现：自动取名（MVP）。 */
  public static createRouter() {
    return t.router({
      // 复用 packages/api 的 chat router（getChatView 等），这里只补齐 server 实现。
      ...appRouterDefine.chat._def.procedures,

      autoTitle: shieldedProcedure
        .input(chatSchemas.autoTitle.input)
        .output(chatSchemas.autoTitle.output)
        .mutation(async ({ ctx, input }) => {
          const session = await ctx.prisma.chatSession.findUnique({
            where: { id: input.sessionId },
            select: { id: true, title: true, isUserRename: true, deletedAt: true },
          });
          if (!session || session.deletedAt) throw new Error("session not found");

          // 用户手动改名后不再自动覆盖，避免把用户标题“改回去”。
          if (session.isUserRename) return { ok: true, title: session.title };

          const chainRows = await loadRightmostChainRows(ctx.prisma, input.sessionId);
          const historyText = buildTitlePrompt(chainRows);
          if (!historyText) return { ok: true, title: session.title };

          let title = "";
          try {
            title = await generateTitleFromHistory(historyText);
          } catch {
            // 模型不可用时保持现状（MVP）。
            return { ok: true, title: session.title };
          }

          if (!title) return { ok: true, title: session.title };

          await ctx.prisma.chatSession.update({
            where: { id: input.sessionId },
            data: { title, isUserRename: false },
          });

          return { ok: true, title };
        }),
    });
  }
}

export const chatRouterImplementation = ChatRouterImpl.createRouter();
