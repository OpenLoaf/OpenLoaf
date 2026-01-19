import type {
  EnsurePrefaceInput,
  MessageRepository,
  SaveMessageInput,
} from "@/ai/application/ports/MessageRepository";
import { ensureSessionPreface, saveMessage } from "@/ai/chat-stream/messageStore";

export class PrismaMessageRepository implements MessageRepository {
  /** Ensure a session preface message exists. */
  async ensurePreface(input: EnsurePrefaceInput): Promise<string | null> {
    return ensureSessionPreface({ sessionId: input.sessionId, message: input.message });
  }

  /** Save a chat message node. */
  async saveMessage(input: SaveMessageInput): Promise<void> {
    await saveMessage({
      sessionId: input.sessionId,
      message: input.message,
      parentMessageId: input.parentMessageId,
    });
  }
}
