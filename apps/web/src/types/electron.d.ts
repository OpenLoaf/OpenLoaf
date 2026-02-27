/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export {};

declare global {
  type OpenLoafViewBounds = { x: number; y: number; width: number; height: number };
  type OpenLoafIncrementalUpdateState =
    | "idle"
    | "checking"
    | "downloading"
    | "ready"
    | "error";
  type OpenLoafIncrementalComponentInfo = {
    /** Current version or "bundled" label. */
    version: string;
    /** Source label: bundled or updated. */
    source: "bundled" | "updated";
    /** New version if an update was detected. */
    newVersion?: string;
    /** Optional release notes. */
    releaseNotes?: string;
    /** Changelog URL (markdown file). */
    changelogUrl?: string;
  };
  type OpenLoafIncrementalUpdateStatus = {
    /** Current incremental update state. */
    state: OpenLoafIncrementalUpdateState;
    /** Server component info. */
    server: OpenLoafIncrementalComponentInfo;
    /** Web component info. */
    web: OpenLoafIncrementalComponentInfo;
    /** Download progress (only when downloading). */
    progress?: { component: "server" | "web"; percent: number };
    /** Last check timestamp. */
    lastCheckedAt?: number;
    /** Error message if any. */
    error?: string;
    /** Status timestamp. */
    ts: number;
  };
  type OpenLoafSpeechResult = {
    type: "partial" | "final";
    text: string;
    lang?: string;
  };
  type OpenLoafSpeechState = {
    state: "listening" | "stopped" | "idle" | "error";
    reason?: string;
    lang?: string;
  };
  type OpenLoafSpeechError = {
    message: string;
    detail?: string;
  };
  /** Transfer progress payload from Electron. */
  type OpenLoafTransferProgress = {
    id: string;
    currentName: string;
    percent: number;
  };
  /** Transfer error payload from Electron. */
  type OpenLoafTransferError = {
    id: string;
    reason?: string;
  };
  /** Transfer complete payload from Electron. */
  type OpenLoafTransferComplete = {
    id: string;
  };
  /** Calendar permission state from system. */
  type OpenLoafCalendarPermissionState = "granted" | "denied" | "prompt" | "unsupported";
  /** Calendar time range for event queries (ISO strings). */
  type OpenLoafCalendarRange = {
    /** Inclusive start time in ISO 8601 format. */
    start: string;
    /** Exclusive end time in ISO 8601 format. */
    end: string;
  };
  /** Calendar metadata shown in the UI. */
  type OpenLoafCalendarItem = {
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
  type OpenLoafCalendarEvent = {
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
  type OpenLoafCalendarResult<T> =
    | { ok: true; data: T }
    | { ok: false; reason: string; code?: string };

  interface Window {
    openloafElectron?: {
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
        bounds: OpenLoafViewBounds;
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
      getIncrementalUpdateStatus?: () => Promise<OpenLoafIncrementalUpdateStatus>;
      /** Reset incremental updates to bundled version. */
      resetIncrementalUpdate?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
      /** Get current update channel (stable / beta). */
      getUpdateChannel?: () => Promise<"stable" | "beta">;
      /** Switch update channel and trigger check. */
      switchUpdateChannel?: (channel: "stable" | "beta") => Promise<{ ok: true } | { ok: false; reason: string }>;
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
      /** Show OS native notification (Electron only). */
      showNotification?: (payload: {
        title: string;
        body: string;
        taskId?: string;
      }) => Promise<{ ok: true } | { ok: false; reason?: string }>;
      /** Calendar API (system calendars). */
      calendar?: {
        /** Request calendar permission from OS. */
        requestPermission: () => Promise<OpenLoafCalendarResult<OpenLoafCalendarPermissionState>>;
        /** List available system calendars. */
        getCalendars: () => Promise<OpenLoafCalendarResult<OpenLoafCalendarItem[]>>;
        /** Update calendar sync range for system pull. */
        setSyncRange?: (
          payload: { workspaceId: string; range?: OpenLoafCalendarRange }
        ) => Promise<{ ok: true } | { ok: false; reason?: string }>;
        /** Trigger immediate system calendar sync. */
        syncNow?: (
          payload: { workspaceId: string; range?: OpenLoafCalendarRange }
        ) => Promise<{ ok: true } | { ok: false; reason?: string }>;
        /** Query events within a time range. */
        getEvents: (
          range: OpenLoafCalendarRange
        ) => Promise<OpenLoafCalendarResult<OpenLoafCalendarEvent[]>>;
        /** Create a new calendar event. */
        createEvent: (
          payload: Omit<OpenLoafCalendarEvent, "id">
        ) => Promise<OpenLoafCalendarResult<OpenLoafCalendarEvent>>;
        /** Update an existing calendar event. */
        updateEvent: (
          payload: OpenLoafCalendarEvent
        ) => Promise<OpenLoafCalendarResult<OpenLoafCalendarEvent>>;
        /** Delete a calendar event by id. */
        deleteEvent: (
          payload: { id: string }
        ) => Promise<OpenLoafCalendarResult<{ id: string }>>;
        /** Subscribe to system calendar changes. */
        subscribeChanges: (
          handler: (detail: { source: "system" }) => void
        ) => () => void;
        /** List reminder calendars (macOS only). */
        getReminderLists?: () => Promise<OpenLoafCalendarResult<OpenLoafCalendarItem[]>>;
        /** Query reminder items within a time range (macOS only). */
        getReminders?: (
          range: OpenLoafCalendarRange
        ) => Promise<OpenLoafCalendarResult<OpenLoafCalendarEvent[]>>;
        /** Create a reminder item (macOS only). */
        createReminder?: (
          payload: Omit<OpenLoafCalendarEvent, "id">
        ) => Promise<OpenLoafCalendarResult<OpenLoafCalendarEvent>>;
        /** Update a reminder item (macOS only). */
        updateReminder?: (
          payload: OpenLoafCalendarEvent
        ) => Promise<OpenLoafCalendarResult<OpenLoafCalendarEvent>>;
        /** Delete a reminder item by id (macOS only). */
        deleteReminder?: (
          payload: { id: string }
        ) => Promise<OpenLoafCalendarResult<{ id: string }>>;
      };
    };
  }
}
