/** Extract plain text from UI message parts. */
export function extractTextFromParts(parts: unknown[]): string {
  const items = Array.isArray(parts) ? (parts as any[]) : []
  return items
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => String(part.text))
    .join('\n')
    .trim()
}

/** Convert JSON payload into SSE chunk. */
export function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
}
