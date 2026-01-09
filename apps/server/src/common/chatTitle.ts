/** File token matcher for @{...} placeholders. */
const FILE_TOKEN_REGEX = /@\{([^}]+)\}/g;

/** Extract a readable file label from a token value. */
function extractFileLabel(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return token;
  const match = trimmed.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? trimmed;
  const parts = baseValue.split("/");
  const label = parts[parts.length - 1] || baseValue;
  return label || baseValue;
}

/** Replace file reference tokens with file names. */
export function replaceFileTokensWithNames(text: string): string {
  if (!text) return text;
  if (!text.includes("@{")) return text;
  return text.replace(FILE_TOKEN_REGEX, (raw, token) => {
    // 中文注释：将文件引用替换为文件名，避免标题过长。
    const label = extractFileLabel(String(token ?? ""));
    return label || raw;
  });
}
