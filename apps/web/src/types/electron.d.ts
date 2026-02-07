export {};

declare global {
  type TenasViewBounds = { x: number; y: number; width: number; height: number };
  type TenasIncrementalUpdateState =
    | "idle"
    | "checking"
    | "downloading"
    | "ready"
    | "error";
  type TenasIncrementalComponentInfo = {
    /** Current version or "bundled" label. */
    version: string;
    /** Source label: bundled or updated. */
    source: "bundled" | "updated";
    /** New version if an update was detected. */
    newVersion?: string;
    /** Optional release notes. */
    releaseNotes?: string;
  };
  type TenasIncrementalUpdateStatus = {
    /** Current incremental update state. */
    state: TenasIncrementalUpdateState;
    /** Server component info. */
    server: TenasIncrementalComponentInfo;
    /** Web component info. */
    web: TenasIncrementalComponentInfo;
    /** Download progress (only when downloading). */
    progress?: { component: "server" | "web"; percent: number };
    /** Last check timestamp. */
    lastCheckedAt?: number;
    /** Error message if any. */
    error?: string;
    /** Status timestamp. */
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
  /** Calendar permission state from system. */
  type TenasCalendarPermissionState = "granted" | "denied" | "prompt" | "unsupported";
  /** Calendar time range for event queries (ISO strings). */
  type TenasCalendarRange = {
    /** Inclusive start time in ISO 8601 format. */
    start: string;
    /** Exclusive end time in ISO 8601 format. */
    end: string;
  };
  /** Calendar metadata shown in the UI. */
  type TenasCalendarItem = {
    /** System calendar id. */
    id: string;
    /** Display title for the calendar. */
    title: string;
    /** Optional calendar color in hex. */
    color?: string;
    /** Whether the calendar is read-only. */
    readOnly?: boolean;
    /** Whether the calendar is subscribed. */
    isSubscribed?: boolean;
  };
  /** Normalized event shape used by UI calendar. */
  type TenasCalendarEvent = {
    /** System event id. */
    id: string;
    /** Event title. */
    title: string;
    /** Event start time in ISO 8601 format. */
    start: string;
    /** Event end time in ISO 8601 format. */
    end: string;
    /** Whether the event is all-day. */
    allDay?: boolean;
    /** Event description. */
    description?: string;
    /** Event location. */
    location?: string;
    /** Event color. */
    color?: string;
    /** Owning calendar id. */
    calendarId?: string;
    /** Recurrence rule string if present. */
    recurrence?: string;
    /** Event kind. */
    kind?: "event" | "reminder";
    /** Whether reminder is completed. */
    completed?: boolean;
  };
  /** Calendar API result wrapper. */
  type TenasCalendarResult<T> =
    | { ok: true; data: T }
    | { ok: false; reason: string; code?: string };

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
      /** Restart the app to apply updates. */
      relaunchApp?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      /** Get runtime port info for backend connectivity. */
      getRuntimePortsSync?: () => { ok: boolean; serverUrl?: string; webUrl?: string };
      /** Update Windows title bar button symbol color. */
      setTitleBarSymbolColor?: (payload: {
        symbolColor: string;
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      /** Update Windows title bar overlay height. */
      setTitleBarOverlayHeight?: (payload: {
        height: number;
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      /** Trigger incremental update check (server/web). */
      checkIncrementalUpdate?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      /** Get incremental update status snapshot. */
      getIncrementalUpdateStatus?: () => Promise<TenasIncrementalUpdateStatus>;
      /** Reset incremental updates to bundled version. */
      resetIncrementalUpdate?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
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
      /** Start OS drag for a list of local file/folder URIs. */
      startDrag?: (payload: {
        uris: string[];
      }) => void;
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
      /** Calendar API (system calendars). */
      calendar?: {
        /** Request calendar permission from OS. */
        requestPermission: () => Promise<TenasCalendarResult<TenasCalendarPermissionState>>;
        /** List available system calendars. */
        getCalendars: () => Promise<TenasCalendarResult<TenasCalendarItem[]>>;
        /** Update calendar sync range for system pull. */
        setSyncRange?: (
          payload: { workspaceId: string; range?: TenasCalendarRange }
        ) => Promise<{ ok: true } | { ok: false; reason?: string }>;
        /** Trigger immediate system calendar sync. */
        syncNow?: (
          payload: { workspaceId: string; range?: TenasCalendarRange }
        ) => Promise<{ ok: true } | { ok: false; reason?: string }>;
        /** Query events within a time range. */
        getEvents: (
          range: TenasCalendarRange
        ) => Promise<TenasCalendarResult<TenasCalendarEvent[]>>;
        /** Create a new calendar event. */
        createEvent: (
          payload: Omit<TenasCalendarEvent, "id">
        ) => Promise<TenasCalendarResult<TenasCalendarEvent>>;
        /** Update an existing calendar event. */
        updateEvent: (
          payload: TenasCalendarEvent
        ) => Promise<TenasCalendarResult<TenasCalendarEvent>>;
        /** Delete a calendar event by id. */
        deleteEvent: (
          payload: { id: string }
        ) => Promise<TenasCalendarResult<{ id: string }>>;
        /** Subscribe to system calendar changes. */
        subscribeChanges: (
          handler: (detail: { source: "system" }) => void
        ) => () => void;
        /** List reminder calendars (macOS only). */
        getReminderLists?: () => Promise<TenasCalendarResult<TenasCalendarItem[]>>;
        /** Query reminder items within a time range (macOS only). */
        getReminders?: (
          range: TenasCalendarRange
        ) => Promise<TenasCalendarResult<TenasCalendarEvent[]>>;
        /** Create a reminder item (macOS only). */
        createReminder?: (
          payload: Omit<TenasCalendarEvent, "id">
        ) => Promise<TenasCalendarResult<TenasCalendarEvent>>;
        /** Update a reminder item (macOS only). */
        updateReminder?: (
          payload: TenasCalendarEvent
        ) => Promise<TenasCalendarResult<TenasCalendarEvent>>;
        /** Delete a reminder item by id (macOS only). */
        deleteReminder?: (
          payload: { id: string }
        ) => Promise<TenasCalendarResult<{ id: string }>>;
      };
    };
  }
}
