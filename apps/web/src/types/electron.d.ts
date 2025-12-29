export {};

declare global {
  type TeatimeViewBounds = { x: number; y: number; width: number; height: number };
  type TeatimeAutoUpdateState =
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  type TeatimeAutoUpdateStatus = {
    state: TeatimeAutoUpdateState;
    currentVersion: string;
    nextVersion?: string;
    releaseNotes?: string;
    lastCheckedAt?: number;
    progress?: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    };
    error?: string;
    ts: number;
  };

  interface Window {
    teatimeElectron?: {
      openBrowserWindow: (url: string) => Promise<{ id: number }>;
      ensureWebContentsView?: (args: {
        key: string;
        url: string;
      }) => Promise<
        { ok: true; webContentsId: number; cdpTargetId?: string } | { ok: false }
      >;
      upsertWebContentsView: (args: {
        key: string;
        url: string;
        bounds: TeatimeViewBounds;
        visible?: boolean;
      }) => Promise<{ ok: true }>;
      destroyWebContentsView: (key: string) => Promise<{ ok: true }>;
      goBackWebContentsView?: (key: string) => Promise<{ ok: true }>;
      goForwardWebContentsView?: (key: string) => Promise<{ ok: true }>;
      clearWebContentsViews?: () => Promise<{ ok: true }>;
      getWebContentsViewCount?: () => Promise<{ ok: true; count: number } | { ok: false }>;
      getAppVersion?: () => Promise<string>;
      checkForUpdates?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      getAutoUpdateStatus?: () => Promise<TeatimeAutoUpdateStatus>;
      installUpdate?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      openPath?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      showItemInFolder?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
    };
  }
}
