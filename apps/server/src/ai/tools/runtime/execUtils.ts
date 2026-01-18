/** Resolve a safe yield time in milliseconds. */
export function resolveYieldTimeMs(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return 100;
}

/** Resolve output length limit from token hint. */
export function resolveMaxOutputChars(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  // 中文注释：按字符数近似 token 上限，避免引入额外的分词依赖。
  return Math.floor(value);
}

/** Build environment variables for exec tools. */
export function buildExecEnv(input: { tty?: boolean }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (input.tty && !env.TERM) env.TERM = "xterm-256color";
  return env;
}

/** Wait for a short duration before reading output. */
export async function waitForOutput(ms?: number): Promise<void> {
  const delay = resolveYieldTimeMs(ms);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}
