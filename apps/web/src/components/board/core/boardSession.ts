/** Read workspace id from document cookies. */
export function getWorkspaceIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)workspace-id=([^;]+)/);
  if (!match) return null;
  const rawValue = match[1];
  if (!rawValue) return null;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}
