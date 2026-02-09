export type OAuthProviderConfig = {
  id: "microsoft" | "google";
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvKey: string;
  clientSecretEnvKey?: string;
  usePKCE: boolean;
  userInfoEndpoint: string;
  parseUserEmail: (data: Record<string, unknown>) => string;
};

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type OAuthExchangeResult = {
  tokens: OAuthTokenSet;
  providerId: string;
  workspaceId: string;
};

export type OAuthState = {
  providerId: string;
  workspaceId: string;
  codeVerifier: string;
  redirectUri: string;
  timestamp: number;
};
