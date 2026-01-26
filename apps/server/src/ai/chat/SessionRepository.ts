export type UpdateSessionTitleInput = {
  /** Session id. */
  sessionId: string;
  /** Title text. */
  title: string;
  /** Whether the title is user-renamed. */
  isUserRename?: boolean;
};

export type SessionErrorInput = {
  /** Session id. */
  sessionId: string;
  /** Error message content. */
  errorMessage: string;
};

export type ClearSessionErrorInput = {
  /** Session id. */
  sessionId: string;
};

export interface SessionRepository {
  /** Resolve rightmost leaf message id for a session. */
  resolveRightmostLeafId(sessionId: string): Promise<string | null>;
  /** Normalize session title input. */
  normalizeSessionTitle(title: string): string;
  /** Update chat session title. */
  updateSessionTitle(input: UpdateSessionTitleInput): Promise<boolean>;
  /** Set the latest error message for a session. */
  setSessionErrorMessage(input: SessionErrorInput): Promise<void>;
  /** Clear the latest error message for a session. */
  clearSessionErrorMessage(input: ClearSessionErrorInput): Promise<void>;
}
