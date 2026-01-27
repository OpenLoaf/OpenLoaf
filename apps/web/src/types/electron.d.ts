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
  /** Transfer progress payload from Electron. */
  type TenasTransferProgress = {
    id: string;
    currentName: string;
    percent: number;
  };
  /** Transfer error payload from Electron. */
  type TenasTransferError = {
    id: string;
    reason?: string;
  };
  /** Transfer complete payload from Electron. */
  type TenasTransferComplete = {
    id: string;
  };

  interface Window {
    tenasElectron?: {
      openBrowserWindow: (url: string) => Promise<{ id: number }>;
      openExternal?: (url: string) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      fetchWebMeta?: (payload: {
        url: string;
        rootUri: string;
      }) => Promise<{
        ok: boolean;
        url: string;
        title?: string;
        description?: string;
        logoPath?: string;
        previewPath?: string;
        error?: string;
      }>;
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
      /** Start a local file/folder transfer into the workspace. */
      startTransfer?: (payload: {
        id: string;
        sourcePath: string;
        targetPath: string;
        kind?: "file" | "folder";
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      /** Resolve local file path from a File object. */
      getPathForFile?: (file: File) => string;
      startSpeechRecognition?: (payload: {
        language?: string;
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      stopSpeechRecognition?: () => Promise<{ ok: true } | { ok: false; reason?: string }>;
    };
  }
}
