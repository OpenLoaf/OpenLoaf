import { prisma } from "@teatime-ai/db";

export type CliThreadInfo = {
  /** CLI type prefix. */
  cliType: string;
  /** CLI thread id. */
  threadId: string;
  /** Raw cliId value. */
  cliId: string;
};

/** CLI id separator. */
const CLI_ID_SEPARATOR = "_";

/** Build a cliId string from cli type and thread id. */
export function buildCliId(cliType: string, threadId: string): string {
  return `${cliType}${CLI_ID_SEPARATOR}${threadId}`;
}

/** Parse a cliId into cli type and thread id. */
export function parseCliId(cliId: string): CliThreadInfo | null {
  const trimmed = cliId.trim();
  if (!trimmed) return null;
  const [cliType, ...rest] = trimmed.split(CLI_ID_SEPARATOR);
  const threadId = rest.join(CLI_ID_SEPARATOR);
  if (!cliType || !threadId) return null;
  return { cliType, threadId, cliId: trimmed };
}

/** Load cliId from the chat session and parse it. */
export async function getCliThreadInfo(sessionId: string): Promise<CliThreadInfo | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { cliId: true },
  });
  if (!session?.cliId) return null;
  return parseCliId(session.cliId);
}

/** Persist cliId for a chat session. */
export async function setCliThreadInfo(
  sessionId: string,
  cliType: string,
  threadId: string,
): Promise<void> {
  const cliId = buildCliId(cliType, threadId);
  // 逻辑：即使会话未创建，也允许写入 cliId，避免丢失线程绑定。
  await prisma.chatSession.upsert({
    where: { id: sessionId },
    update: { cliId },
    create: { id: sessionId, cliId },
  });
}

/** Clear cliId for a chat session. */
export async function clearCliThreadInfo(sessionId: string): Promise<void> {
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { cliId: null },
  });
}
