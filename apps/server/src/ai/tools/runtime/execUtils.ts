/** Resolve a safe yield time in milliseconds. */
export function resolveYieldTimeMs(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return 100;
}

/** Resolve output length limit from token hint. */
export function resolveMaxOutputChars(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  // 按字符数近似 token 上限，避免引入额外的分词依赖。
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

type UnifiedExecFormatInput = {
  /** Chunk id for the response. */
  chunkId?: string;
  /** Wall time in milliseconds. */
  wallTimeMs: number;
  /** Process exit code if finished. */
  exitCode: number | null;
  /** Session id if still running. */
  sessionId?: string;
  /** Output content. */
  output: string;
  /** Original token count, if available. */
  originalTokenCount?: number;
};

/** Format unified exec output to match Codex. */
export function formatUnifiedExecOutput(input: UnifiedExecFormatInput): string {
  const sections: string[] = [];
  if (input.chunkId) sections.push(`Chunk ID: ${input.chunkId}`);
  sections.push(`Wall time: ${(input.wallTimeMs / 1000).toFixed(4)} seconds`);
  if (input.exitCode !== null) {
    sections.push(`Process exited with code ${input.exitCode}`);
  }
  if (input.sessionId) {
    sections.push(`Process running with session ID ${input.sessionId}`);
  }
  if (typeof input.originalTokenCount === "number") {
    sections.push(`Original token count: ${input.originalTokenCount}`);
  }
  sections.push("Output:");
  sections.push(input.output);
  return sections.join("\n");
}
