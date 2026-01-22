export {};

declare global {
  type TenasViewBounds = { x: number; y: number; width: number; height: number };
  type TenasAutoUpdateState =
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  type TenasAutoUpdateStatus = {
    state: TenasAutoUpdateState;
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
  type TenasSpeechResult = {
    type: "partial" | "final";
    text: string;
    lang?: string;
  };
  type TenasSpeechState = {
    state: "listening" | "stopped" | "idle" | "error";
    reason?: string;
    lang?: string;
  };
  type TenasSpeechError = {
    message: string;
    detail?: string;
  };

  interface Window {
    tenasElectron?: {
      openBrowserWindow: (url: string) => Promise<{ id: number }>;
      openExternal?: (url: string) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      ensureWebContentsView?: (args: {
        key: string;
        url: string;
      }) => Promise<
        { ok: true; webContentsId: number; cdpTargetId?: string } | { ok: false }
      >;
      upsertWebContentsView: (args: {
        key: string;
        url: string;
        bounds: TenasViewBounds;
        visible?: boolean;
      }) => Promise<{ ok: true }>;
      destroyWebContentsView: (key: string) => Promise<{ ok: true }>;
      goBackWebContentsView?: (key: string) => Promise<{ ok: true }>;
      goForwardWebContentsView?: (key: string) => Promise<{ ok: true }>;
      clearWebContentsViews?: () => Promise<{ ok: true }>;
      getWebContentsViewCount?: () => Promise<{ ok: true; count: number } | { ok: false }>;
      getAppVersion?: () => Promise<string>;
      /** Get runtime port info for backend connectivity. */
      getRuntimePortsSync?: () => { ok: boolean; serverUrl?: string; webUrl?: string };
      checkForUpdates?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      getAutoUpdateStatus?: () => Promise<TenasAutoUpdateStatus>;
      installUpdate?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      openPath?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      showItemInFolder?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      trashItem?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      getCacheSize?: (payload: {
        rootUri?: string;
      }) => Promise<{ ok: true; bytes: number } | { ok: false; reason?: string }>;
      clearCache?: (payload: {
        rootUri?: string;
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      pickDirectory?: (payload?: {
        defaultPath?: string;
      }) => Promise<{ ok: true; path: string } | { ok: false }>;
      saveFile?: (payload: {
        contentBase64: string;
        defaultDir?: string;
        suggestedName?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<
        | { ok: true; path: string }
        | { ok: false; canceled?: boolean; reason?: string }
      >;
      startSpeechRecognition?: (payload: {
        language?: string;
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      stopSpeechRecognition?: () => Promise<{ ok: true } | { ok: false; reason?: string }>;
    };
  }
}
