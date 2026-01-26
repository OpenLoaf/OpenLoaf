import type {
  EnsurePrefaceInput,
  MessageRepository,
  SaveMessageInput,
} from "@/ai/chat/MessageRepository";
import { ensureSessionPreface, saveMessage } from "@/ai/chat/repositories/messageStore";

export class PrismaMessageRepository implements MessageRepository {
  /** Ensure a session preface message exists. */
  async ensurePreface(input: EnsurePrefaceInput): Promise<void> {
    return ensureSessionPreface({ sessionId: input.sessionId, text: input.text });
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
