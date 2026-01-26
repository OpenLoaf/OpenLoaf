import type {
  ClearSessionErrorInput,
  SessionErrorInput,
  SessionRepository,
  UpdateSessionTitleInput,
} from "@/ai/chat/SessionRepository";
import {
  clearSessionErrorMessage,
  normalizeSessionTitle,
  resolveRightmostLeafId,
  setSessionErrorMessage,
  updateSessionTitle,
} from "@/ai/chat/repositories/messageStore";

export class PrismaSessionRepository implements SessionRepository {
  /** Resolve rightmost leaf message id for a session. */
  async resolveRightmostLeafId(sessionId: string): Promise<string | null> {
    return resolveRightmostLeafId(sessionId);
  }

  /** Normalize session title input. */
  normalizeSessionTitle(title: string): string {
    return normalizeSessionTitle(title);
  }

  /** Update chat session title. */
  async updateSessionTitle(input: UpdateSessionTitleInput): Promise<boolean> {
    return updateSessionTitle(input);
  }

  /** Set the latest error message for a session. */
  async setSessionErrorMessage(input: SessionErrorInput): Promise<void> {
    await setSessionErrorMessage({
      sessionId: input.sessionId,
      errorMessage: input.errorMessage,
    });
  }

  /** Clear the latest error message for a session. */
  async clearSessionErrorMessage(input: ClearSessionErrorInput): Promise<void> {
    await clearSessionErrorMessage({ sessionId: input.sessionId });
  }
}
