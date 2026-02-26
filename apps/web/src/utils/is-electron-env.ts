/**
 * Resolve whether the runtime is Electron.
 * Checks injected Electron API first, then env flag, then user agent.
 */
export function isElectronEnv(): boolean {
  if (typeof window !== "undefined" && window.openloafElectron) return true;
  if (process.env.NEXT_PUBLIC_ELECTRON === "1") return true;
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("Electron");
}
