import { getEnvString } from "@teatime-ai/config";

export type Auth0Config = {
  /** Auth0 tenant domain. */
  domain: string;
  /** Auth0 native app client id. */
  clientId: string;
  /** Auth0 API audience. */
  audience: string;
  /** Auth0 redirect URI. */
  redirectUri: string;
  /** OAuth scope string. */
  scope: string;
};

export type Auth0TokenResponse = {
  /** OAuth access token. */
  access_token: string;
  /** Refresh token (optional). */
  refresh_token?: string;
  /** ID token for user profile (optional). */
  id_token?: string;
  /** Expiration in seconds. */
  expires_in?: number;
  /** Token type. */
  token_type?: string;
};

/**
 * Resolve Auth0 configuration from environment.
 */
export function getAuth0Config(): Auth0Config {
  const domain = getEnvString(process.env, "AUTH0_DOMAIN", { required: true })!;
  const clientId = getEnvString(process.env, "AUTH0_CLIENT_ID", { required: true })!;
  const audience = getEnvString(process.env, "AUTH0_AUDIENCE", { required: true })!;
  const redirectUri = getEnvString(process.env, "AUTH0_REDIRECT_URI", { required: true })!;
  const scope =
    getEnvString(process.env, "AUTH0_SCOPE", { required: false }) ??
    "openid profile email offline_access";
  return { domain, clientId, audience, redirectUri, scope };
}

/**
 * Build the Auth0 authorize URL for PKCE login.
 */
export function buildAuthorizeUrl(input: {
  config: Auth0Config;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(`https://${input.config.domain}/authorize`);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("audience", input.config.audience);
  url.searchParams.set("scope", input.config.scope);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForToken(input: {
  config: Auth0Config;
  code: string;
  codeVerifier: string;
}): Promise<Auth0TokenResponse> {
  const tokenUrl = `https://${input.config.domain}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.config.clientId,
    code: input.code,
    redirect_uri: input.config.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Auth0 token exchange failed (${response.status})`);
  }
  return (await response.json()) as Auth0TokenResponse;
}

/**
 * Refresh tokens with Auth0.
 */
export async function refreshAccessToken(input: {
  config: Auth0Config;
  refreshToken: string;
}): Promise<Auth0TokenResponse> {
  const tokenUrl = `https://${input.config.domain}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.config.clientId,
    refresh_token: input.refreshToken,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Auth0 refresh failed (${response.status})`);
  }
  return (await response.json()) as Auth0TokenResponse;
}
