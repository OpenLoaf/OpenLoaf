import crypto from "node:crypto";

type PkceEntry = {
  /** PKCE verifier value. */
  verifier: string;
  /** Entry creation timestamp (ms). */
  createdAt: number;
};

// 逻辑：使用内存 Map 存放短期 PKCE state，避免落盘。
const pkceStore = new Map<string, PkceEntry>();
// 逻辑：state 有效期 10 分钟，过期直接作废。
const PKCE_TTL_MS = 10 * 60 * 1000;

/**
 * Create a PKCE verifier/challenge pair.
 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

/**
 * Store the PKCE verifier by state.
 */
export function storePkceState(state: string, verifier: string): void {
  pkceStore.set(state, { verifier, createdAt: Date.now() });
}

/**
 * Consume the verifier for a given state.
 */
export function consumePkceVerifier(state: string): string | null {
  const entry = pkceStore.get(state);
  pkceStore.delete(state);
  if (!entry) return null;
  // 逻辑：只允许 10 分钟内的 state 使用，过期视为无效。
  if (Date.now() - entry.createdAt > PKCE_TTL_MS) return null;
  return entry.verifier;
}

/**
 * Clear all pending PKCE states.
 */
export function clearPkceStates(): void {
  pkceStore.clear();
}

/**
 * Encode bytes into base64url format.
 */
function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
