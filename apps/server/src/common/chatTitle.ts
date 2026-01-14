/** File token matcher for @tenas-file:// placeholders. */
const FILE_TOKEN_REGEX = /@(tenas-file:\/\/[^\s]+)/g;

/** Extract a readable file label from a token value. */
function extractFileLabel(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return token;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const labelBase = (() => {
    if (!baseValue.startsWith("tenas-file://")) return baseValue;
    try {
      const parsed = new URL(baseValue);
      const relativePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      return relativePath || baseValue;
    } catch {
      return baseValue;
    }
  })();
  const parts = labelBase.split("/");
  const label = parts[parts.length - 1] || labelBase;
  return label || baseValue;
}

/** Replace file reference tokens with file names. */
export function replaceFileTokensWithNames(text: string): string {
  if (!text) return text;
  if (!text.includes("@tenas-file://")) return text;
  return text.replace(FILE_TOKEN_REGEX, (raw, token) => {
    // 中文注释：将文件引用替换为文件名，避免标题过长。
    const label = extractFileLabel(String(token ?? raw ?? ""));
    return label || raw;
  });
}
