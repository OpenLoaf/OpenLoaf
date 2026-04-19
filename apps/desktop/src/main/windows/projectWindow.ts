import { app, BrowserWindow, screen, shell } from "electron";
import { resolveWindowIconForBrowser } from "../resolveWindowIcon";
import { WEBPACK_ENTRIES } from "../webpackEntries";
import type { Logger } from "../logging/startupLogger";

type CreateProjectWindowArgs = {
  log: Logger;
  webUrl: string;
  projectId: string;
  rootUri: string;
  title: string;
  icon?: string | null;
};

const projectWindowsByProjectId = new Map<string, BrowserWindow>();

/** Estimate a stable default size for child app windows. */
function getDefaultWindowSize() {
  const MIN_WIDTH = 800;
  const MIN_HEIGHT = 640;
  const MAX_WIDTH = 1800;
  const ASPECT_W = 16;
  const ASPECT_H = 10;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workAreaWidth = display.workAreaSize.width;

  let width = Math.round(workAreaWidth * 0.76);
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

/** Disable zoom shortcuts in dedicated project windows. */
function disableZoom(win: BrowserWindow) {
  win.webContents.setVisualZoomLevelLimits(1, 1).catch((): void => undefined);
  const legacySetZoomLevelLimits = (
    win.webContents as { setZoomLevelLimits?: (min: number, max: number) => void }
  ).setZoomLevelLimits;
  if (typeof legacySetZoomLevelLimits === "function") {
    legacySetZoomLevelLimits.call(win.webContents, 0, 0);
  }
  win.webContents.setZoomFactor(1);
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const isZoomShortcut =
      (input.control || input.meta) &&
      (input.key === "+" || input.key === "-" || input.key === "=" || input.key === "0");
    if (!isZoomShortcut) return;
    event.preventDefault();
  });
}

/** Bring an existing project window to the foreground. */
function focusProjectWindow(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.executeJavaScript("document.activeElement?.blur()").catch(() => {});
}

/** Build the web URL for one dedicated project window. */
function buildProjectWindowUrl(args: CreateProjectWindowArgs) {
  const target = new URL("/", args.webUrl);
  target.searchParams.set("windowMode", "project");
  target.searchParams.set("projectId", args.projectId);
  target.searchParams.set("rootUri", args.rootUri);
  target.searchParams.set("title", args.title);
  if (args.icon?.trim()) {
    target.searchParams.set("icon", args.icon.trim());
  }
  return target.toString();
}

/** Create or focus a dedicated app window for one project. */
export function createProjectWindow(args: CreateProjectWindowArgs) {
  const existing = projectWindowsByProjectId.get(args.projectId);
  if (existing && !existing.isDestroyed()) {
    focusProjectWindow(existing);
    return existing;
  }

  const { width, height } = getDefaultWindowSize();
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const windowIcon = resolveWindowIconForBrowser();

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 640,
    // 中文注释：项目独立窗口必须是顶层窗口；一旦挂 parent，会导致层级被绑定且拖动联动。
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
    ...(isLinux ? { titleBarStyle: "hidden" as const } : {}),
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
      args.log(`[project-window:window-open] ${targetUrl}`);
      void shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  const targetUrl = buildProjectWindowUrl(args);
  args.log(`[project-window] loading ${targetUrl}`);
  void win.loadURL(targetUrl);
  focusProjectWindow(win);

  projectWindowsByProjectId.set(args.projectId, win);
  win.on("closed", () => {
    if (projectWindowsByProjectId.get(args.projectId) === win) {
      projectWindowsByProjectId.delete(args.projectId);
    }
  });

  return win;
}
