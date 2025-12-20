import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import type { UiEvent } from "@teatime-ai/api/types/event";
import {
  runtimeClientMessageSchema,
  runtimeOpenPageResultSchema,
  type RuntimeAck,
  type RuntimeCommand,
  type RuntimeHello,
  type RuntimeOpenPageCommand,
  type RuntimeOpenPageResult,
} from "@teatime-ai/api/types/runtime";

const DEBUG_RUNTIME_WS = process.env.TEATIME_DEBUG_RUNTIME_WS === "1";

type RuntimeConnection = {
  ws: import("ws").WebSocket;
  hello: RuntimeHello;
  connectedAt: number;
};

type PendingRequest = {
  appId: string;
  resolve: (value: RuntimeAck) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
};

/**
 * Browser Runtime Hub（MVP）：
 * - 通过 WebSocket 统一接入 Electron runtime
 * - server 可以下发命令并等待回执（requestId 关联）
 */
function createRuntimeHub() {
  const wss = new WebSocketServer({ noServer: true });
  const runtimesByAppId = new Map<string, RuntimeConnection>();
  const pendingByRequestId = new Map<string, PendingRequest>();

  function attachToServer(server: import("node:http").Server, path = "/runtime-ws") {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "", "http://localhost");
      if (url.pathname !== path) return;
      try {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } catch (err) {
        if (DEBUG_RUNTIME_WS) console.error("[runtime-ws] handleUpgrade failed", err);
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
    });
  }

  function hasElectronRuntime(appId: string) {
    return runtimesByAppId.has(appId);
  }

  function getElectronRuntimeStatus(appId: string): { connected: boolean; connectedAt?: number; instanceId?: string } {
    const runtime = runtimesByAppId.get(appId);
    if (!runtime) return { connected: false };
    return { connected: true, connectedAt: runtime.connectedAt, instanceId: runtime.hello.instanceId };
  }

  function sendCommandToElectron(input: {
    appId: string;
    requestId: string;
    command: RuntimeCommand;
    timeoutMs: number;
  }): Promise<RuntimeAck> {
    const runtime = runtimesByAppId.get(input.appId);
    if (!runtime) return Promise.reject(new Error(`Electron runtime offline: appId=${input.appId}`));

    const ws = runtime.ws;
    if (ws.readyState !== ws.OPEN) return Promise.reject(new Error(`Electron runtime not ready: appId=${input.appId}`));

    return new Promise<RuntimeAck>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingByRequestId.delete(input.requestId);
        reject(new Error(`Runtime command timeout: ${input.command.kind}`));
      }, input.timeoutMs);

      pendingByRequestId.set(input.requestId, { appId: input.appId, resolve, reject, timeout });

      ws.send(JSON.stringify({ type: "command", command: input.command }));
    });
  }

  async function openPageOnElectron(input: {
    appId: string;
    pageTargetId: string;
    url: string;
    tabId: string;
    title?: string;
    timeoutMs?: number;
  }): Promise<RuntimeOpenPageResult> {
    const requestId = crypto.randomUUID();
    const command: RuntimeOpenPageCommand = {
      kind: "openPage",
      requestId,
      pageTargetId: input.pageTargetId,
      url: input.url,
      tabId: input.tabId,
      title: input.title,
    };
    const ack = await sendCommandToElectron({
      appId: input.appId,
      requestId,
      command,
      timeoutMs: input.timeoutMs ?? 15_000,
    });
    if (!ack.ok) throw new Error(ack.error || "Runtime openPage failed");
    const parsed = runtimeOpenPageResultSchema.safeParse(ack.result);
    if (!parsed.success) throw new Error("Runtime openPage returned invalid result");
    return parsed.data;
  }

  async function emitUiEventOnElectron(input: { appId: string; event: UiEvent; timeoutMs?: number }) {
    const requestId = crypto.randomUUID();
    const ack = await sendCommandToElectron({
      appId: input.appId,
      requestId,
      command: { kind: "uiEvent", requestId, event: input.event },
      timeoutMs: input.timeoutMs ?? 8_000,
    });
    if (!ack.ok) throw new Error(ack.error || "Runtime uiEvent failed");
  }

  function toText(raw: unknown): string | null {
    if (typeof raw === "string") return raw;
    if (Buffer.isBuffer(raw)) return raw.toString("utf-8");
    if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf-8");
    if (ArrayBuffer.isView(raw)) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf-8");
    if (Array.isArray(raw) && raw.every((x) => Buffer.isBuffer(x))) return Buffer.concat(raw).toString("utf-8");
    return null;
  }

  async function handleConnection(ws: import("ws").WebSocket) {
    let boundAppId: string | null = null;

    ws.on("close", () => {
      if (boundAppId) runtimesByAppId.delete(boundAppId);
      // 中文注释：断线时把 pending 全部失败，避免请求永久挂起。
      for (const [requestId, pending] of pendingByRequestId) {
        if (pending.appId !== boundAppId) continue;
        clearTimeout(pending.timeout);
        pending.reject(new Error("Runtime disconnected"));
        pendingByRequestId.delete(requestId);
      }
    });

    ws.on("message", (data) => {
      const text = toText(data);
      if (!text) return;
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return;
      }

      const parsed = runtimeClientMessageSchema.safeParse(raw);
      if (!parsed.success) return;

      const msg = parsed.data;
      if (msg.type === "hello") {
        const appId = msg.runtimeType === "electron" ? msg.appId ?? "" : "";
        if (msg.runtimeType === "electron" && !appId) {
          ws.send(JSON.stringify({ type: "helloAck", ok: false, serverTime: Date.now(), error: "Missing appId" }));
          return;
        }
        if (msg.runtimeType === "electron") {
          boundAppId = appId;
          runtimesByAppId.set(appId, { ws, hello: { ...msg, appId } as RuntimeHello, connectedAt: Date.now() });
          ws.send(JSON.stringify({ type: "helloAck", ok: true, serverTime: Date.now() }));
          if (DEBUG_RUNTIME_WS) console.log("[runtime-ws] hello", { appId, instanceId: msg.instanceId });
        }
        return;
      }

      if (msg.type === "ack") {
        const pending = pendingByRequestId.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingByRequestId.delete(msg.requestId);
        pending.resolve(msg);
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
      }
    });
  }

  wss.on("connection", (ws) => {
    void handleConnection(ws);
  });

  return {
    attachToServer,
    hasElectronRuntime,
    getElectronRuntimeStatus,
    openPageOnElectron,
    emitUiEventOnElectron,
  } as const;
}

export const runtimeHub = createRuntimeHub();

