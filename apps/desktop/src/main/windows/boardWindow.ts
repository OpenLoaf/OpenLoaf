import { app, BrowserWindow, screen, shell } from "electron";
import { resolveWindowIconPath } from "../resolveWindowIcon";
import { WEBPACK_ENTRIES } from "../webpackEntries";
import type { Logger } from "../logging/startupLogger";

type CreateBoardWindowArgs = {
  log: Logger;
  webUrl: string;
  boardId: string;
  boardFolderUri: string;
  boardFileUri: string;
  rootUri: string;
  title: string;
  projectId?: string;
};

const boardWindowsByBoardId = new Map<string, BrowserWindow>();

/** Estimate a stable default size for board windows. */
function getDefaultWindowSize() {
  const MIN_WIDTH = 900;
  const MIN_HEIGHT = 640;
  const MAX_WIDTH = 1800;
  const ASPECT_W = 16;
  const ASPECT_H = 10;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workAreaWidth = display.workAreaSize.width;

  let width = Math.round(workAreaWidth * 0.8);
  width = Math.min(width, MAX_WIDTH);
  width = Math.max(width, MIN_WIDTH);

  let height = Math.round((width * ASPECT_H) / ASPECT_W);
  if (height < MIN_HEIGHT) {
    height = MIN_HEIGHT;
  }

  return { width, height };
}

/** Keep the child window title pinned to the app display name. */
function bindWindowTitle(win: BrowserWindow) {
  const displayName = app.name || "OpenLoaf";
  win.setTitle(displayName);
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(displayName);
  });
}

/** Bring an existing board window to the foreground. */
function focusBoardWindow(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.executeJavaScript("document.activeElement?.blur()").catch(() => {});
}

/**
 * Disable all zoom behaviors (menu, shortcuts, trackpad/pinch).
 * 画布窗口必须禁用 Electron 页面缩放，否则触控板捏合手势会同时触发画布缩放和
 * Electron 页面缩放，导致坐标转换偏移（鼠标位置与实际操作位置不一致）。
 */
function disableZoom(win: BrowserWindow): void {
  win.webContents.setVisualZoomLevelLimits(1, 1).catch((): void => undefined);
  const legacySetZoomLevelLimits = (
    win.webContents as { setZoomLevelLimits?: (min: number, max: number) => void }
  ).setZoomLevelLimits;
  if (typeof legacySetZoomLevelLimits === 'function') {
    legacySetZoomLevelLimits.call(win.webContents, 0, 0);
  }
  win.webContents.setZoomFactor(1);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const isZoomShortcut =
      (input.control || input.meta) &&
      (input.key === '+' || input.key === '-' || input.key === '=' || input.key === '0');
    if (!isZoomShortcut) return;
    event.preventDefault();
  });
}

/** Build the web URL for one dedicated board window. */
function buildBoardWindowUrl(args: CreateBoardWindowArgs) {
  const target = new URL("/", args.webUrl);
  target.searchParams.set("windowMode", "board");
  target.searchParams.set("boardId", args.boardId);
  target.searchParams.set("boardFolderUri", args.boardFolderUri);
  target.searchParams.set("boardFileUri", args.boardFileUri);
  target.searchParams.set("rootUri", args.rootUri);
  target.searchParams.set("title", args.title);
  if (args.projectId) {
    target.searchParams.set("projectId", args.projectId);
  }
  return target.toString();
}

/** Create or focus a dedicated app window for one board. */
export function createBoardWindow(args: CreateBoardWindowArgs) {
  const existing = boardWindowsByBoardId.get(args.boardId);
  if (existing && !existing.isDestroyed()) {
    focusBoardWindow(existing);
    return existing;
  }

  const { width, height } = getDefaultWindowSize();
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const windowIcon = resolveWindowIconPath();

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#0f1115",
    ...(windowIcon ? { icon: windowIcon } : {}),
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {}),
    ...(isWindows
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: { color: "rgba(0, 0, 0, 0)" },
        }
      : {}),
    webPreferences: {
      preload: WEBPACK_ENTRIES.mainPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  bindWindowTitle(win);
  disableZoom(win);
  win.webContents.setWindowOpenHandler((details) => {
    const targetUrl = String(details?.url ?? "").trim();
    if (targetUrl && /^https?:/i.test(targetUrl)) {
      args.log(`[board-window:window-open] ${targetUrl}`);
      void shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  const targetUrl = buildBoardWindowUrl(args);
  args.log(`[board-window] loading ${targetUrl}`);
  void win.loadURL(targetUrl);
  focusBoardWindow(win);

  boardWindowsByBoardId.set(args.boardId, win);
  win.on("closed", () => {
    if (boardWindowsByBoardId.get(args.boardId) === win) {
      boardWindowsByBoardId.delete(args.boardId);
    }
  });

  return win;
}
