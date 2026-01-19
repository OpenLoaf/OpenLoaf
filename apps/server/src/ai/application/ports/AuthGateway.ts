export type AuthUserSnapshot = {
  /** User subject id. */
  sub?: string;
  /** User email. */
  email?: string;
  /** User display name. */
  name?: string;
  /** Avatar URL. */
  avatarUrl?: string;
  /** Avatar base64 data URL. */
  picture?: string;
};

export type AuthSessionSnapshot = {
  /** Whether the session is authenticated. */
  loggedIn: boolean;
  /** Optional user profile snapshot. */
  user?: AuthUserSnapshot;
};

export interface AuthGateway {
  /** Read the current auth session snapshot. */
  getAuthSessionSnapshot(): AuthSessionSnapshot;
}
