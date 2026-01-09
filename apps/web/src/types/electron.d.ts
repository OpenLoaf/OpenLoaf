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
  type TeatimeSpeechResult = {
    type: "partial" | "final";
    text: string;
    lang?: string;
  };
  type TeatimeSpeechState = {
    state: "listening" | "stopped" | "idle" | "error";
    reason?: string;
    lang?: string;
  };
  type TeatimeSpeechError = {
    message: string;
    detail?: string;
  };

  interface Window {
    teatimeElectron?: {
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
        bounds: TeatimeViewBounds;
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
      getAutoUpdateStatus?: () => Promise<TeatimeAutoUpdateStatus>;
      installUpdate?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      openPath?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      showItemInFolder?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      trashItem?: (payload: { uri: string }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      pickDirectory?: () => Promise<{ ok: true; path: string } | { ok: false }>;
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
