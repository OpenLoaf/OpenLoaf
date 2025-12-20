import type { BrowserWindow } from "electron";
import type { DockItem } from "../../../../../packages/api/src/common";
import { uiEvents } from "../../../../../packages/api/src/types/event";
import type { RuntimeCommand, RuntimeHello, RuntimeServerMessage } from "../../../../../packages/api/src/types/runtime";
import { runtimeServerMessageSchema } from "../../../../../packages/api/src/types/runtime";
import { getWebContentsView, upsertWebContentsView } from "../ipc/webContentsViews";
import { getElectronClientId } from "./electronClientId";

type Logger = (msg: string) => void;

function toRuntimeWsUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = new URL("/runtime-ws", url);
  wsUrl.protocol = wsProtocol;
  return wsUrl.toString();
}

function buildBrowserWindowDockItem(input: {
  url: string;
  title?: string;
  pageTargetId: string;
}): DockItem {
  return {
    id: `browser-window:${input.pageTargetId}`,
    sourceKey: `browser-window:${input.pageTargetId}`,
    component: "electron-browser-window",
    title: input.title ?? "Browser Window",
    params: { url: input.url, autoOpen: true, pageTargetId: input.pageTargetId },
  };
}

/**
 * 从某个 WebContents 获取 CDP targetId：
 * - 使用 `webContents.debugger` 临时 attach，读取 Target.getTargetInfo，再 detach
 * - 目的：让 server 侧的 Playwright/CDP 能“精确 attach”，避免多 tab/同 URL 串页
 */
async function getCdpTargetId(webContents: Electron.WebContents): Promise<string | undefined> {
  const dbg = webContents.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    const info = (await dbg.sendCommand("Target.getTargetInfo")) as {
      targetInfo?: { targetId?: string };
    };
    const id = String(info?.targetInfo?.targetId ?? "");
    return id || undefined;
  } catch {
    return undefined;
  } finally {
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * 启动 Electron Browser Runtime client：
 * - 连接 server 的 /runtime-ws
 * - hello 注册（携带 electronClientId）
 * - 接收 openPage 命令，在主进程创建/复用 WebContentsView，并通过 IPC 推 UiEvent 让 renderer 渲染 stack
 */
export function startBrowserRuntimeClient(input: {
  serverUrl: string;
  getMainWindow: () => BrowserWindow | null;
  log?: Logger;
}) {
  const log = input.log ?? (() => {});
  const wsUrl = toRuntimeWsUrl(input.serverUrl);
  const electronClientId = getElectronClientId();

  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let lastPongAt = 0;
  let reconnectAttempt = 0;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const scheduleReconnect = (reason: string) => {
    if (stopped) return;
    clearTimers();
    // 关键：断线立即尝试重连；若持续失败，则指数退避避免疯狂刷连接。
    const delayMs = reconnectAttempt === 0 ? 0 : Math.min(5000, 200 * 2 ** (reconnectAttempt - 1));
    reconnectAttempt += 1;
    log(`[runtime] reconnect scheduled: ${delayMs}ms (${reason})`);
    reconnectTimer = setTimeout(connect, delayMs);
  };

  const connect = () => {
    if (stopped) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    clearTimers();

    log(`[runtime] connecting: ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      reconnectAttempt = 0;
      const hello: RuntimeHello = {
        type: "hello",
        runtimeType: "electron",
        instanceId: `${electronClientId}:${process.pid}`,
        electronClientId,
        capabilities: { openPage: true },
      };
      ws?.send(JSON.stringify(hello));

      // 关键：心跳检测 half-open 连接；若长时间没有 pong，则主动断开触发重连。
      lastPongAt = Date.now();
      heartbeatTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const now = Date.now();
        try {
          ws.send(JSON.stringify({ type: "ping", clientTime: now }));
        } catch {
          // ignore
        }
        if (now - lastPongAt > 45_000) {
          log("[runtime] heartbeat timeout; closing ws");
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
      }, 15_000);
    });

    ws.addEventListener("message", (evt) => {
      const data = typeof evt.data === "string" ? evt.data : String(evt.data ?? "");
      let raw: unknown;
      try {
        raw = JSON.parse(data);
      } catch {
        return;
      }

      const parsed = runtimeServerMessageSchema.safeParse(raw);
      if (!parsed.success) return;

      const msg: RuntimeServerMessage = parsed.data;
      if (msg.type === "helloAck") {
        if (!msg.ok) {
          log(`[runtime] hello rejected: ${msg.error ?? "unknown"}`);
          ws?.close();
        } else {
          log(`[runtime] hello ok: electronClientId=${electronClientId}`);
        }
        return;
      }

      if (msg.type === "pong") {
        lastPongAt = Date.now();
        return;
      }

      if (msg.type === "command") {
        void handleCommand(msg.command);
      }
    });

    ws.addEventListener("close", () => {
      ws = null;
      clearTimers();
      scheduleReconnect("close");
    });

    ws.addEventListener("error", () => {
      // 关键：某些情况下只触发 error 不触发 close；主动 close 统一走重连逻辑。
      try {
        ws?.close();
      } catch {
        // ignore
      }
    });
  };

  const sendAck = (ack: { requestId: string; ok: boolean; result?: unknown; error?: string }) => {
    ws?.send(JSON.stringify({ type: "ack", ...ack }));
  };

  const handleCommand = async (command: RuntimeCommand) => {
    if (command.kind === "uiEvent") {
      try {
        const win = input.getMainWindow();
        if (!win) throw new Error("No main window");

        win.webContents.send("teatime:ui-event", command.event);
        sendAck({ requestId: command.requestId, ok: true });
      } catch (err) {
        sendAck({
          requestId: command.requestId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (command.kind !== "openPage") return;

    try {
      const win = input.getMainWindow();
      if (!win) throw new Error("No main window");

      const viewKey = `browser-window:${command.pageTargetId}`;
      upsertWebContentsView(win, {
        key: viewKey,
        url: command.url,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: false,
      });

      const view = getWebContentsView(win, viewKey);
      const webContentsId = view?.webContents?.id;
      const cdpTargetId = view?.webContents ? await getCdpTargetId(view.webContents) : undefined;

      // 关键：由 Electron main 触发 UI 事件，让 renderer 在指定 tabId 创建 stack 容器。
      win.webContents.send(
        "teatime:ui-event",
        uiEvents.pushStackItem({
          tabId: command.tabId,
          item: buildBrowserWindowDockItem({
            url: command.url,
            title: command.title,
            pageTargetId: command.pageTargetId,
          }),
        }),
      );

      sendAck({
        requestId: command.requestId,
        ok: true,
        result: {
          pageTargetId: command.pageTargetId,
          backend: "electron",
          cdpTargetId,
          webContentsId: typeof webContentsId === "number" ? webContentsId : undefined,
        },
      });
    } catch (err) {
      sendAck({
        requestId: command.requestId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  connect();

  return {
    stop: () => {
      stopped = true;
      clearTimers();
      try {
        ws?.close();
      } catch {
        // ignore
      }
      ws = null;
    },
  };
}
