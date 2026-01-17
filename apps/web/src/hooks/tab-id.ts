/** Generate a stable sub-tab id with a random UUID fallback. */
function createSubTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Create a new browser sub-tab id. */
export function createBrowserTabId(): string {
  return createSubTabId();
}

/** Create a new terminal sub-tab id. */
export function createTerminalTabId(): string {
  return createSubTabId();
}
