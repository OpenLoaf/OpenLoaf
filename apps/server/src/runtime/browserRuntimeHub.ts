import { runtimeClientMessageSchema } from "@teatime-ai/api/types/runtime";
import type {
  RuntimeAck,
  RuntimeHello,
  RuntimeCommand,
  RuntimeOpenPageCommand,
  RuntimeOpenPageResult,
} from "@teatime-ai/api/types/runtime";
import { runtimeOpenPageResultSchema } from "@teatime-ai/api/types/runtime";
import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { UiEvent } from "@teatime-ai/api/types/event";

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
 * - 通过一个 WebSocket 统一接入 Electron/Headless runtime
 * - server 可以下发命令并等待回执（requestId 关联）
 */
class BrowserRuntimeHub {
  private wss = new WebSocketServer({ noServer: true });
  private runtimesByAppId = new Map<string, RuntimeConnection>();
  private pendingByRequestId = new Map<string, PendingRequest>();

  constructor() {
    this.wss.on("connection", (ws, req) => {
      void this.handleConnection(ws, req);
    });
  }

  /**
   * 将 Hub 挂载到现有 HTTP server 的 upgrade 流程中（只处理 /runtime-ws）。
   */
  attachToServer(server: import("node:http").Server, path = "/runtime-ws") {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "", "http://localhost");
      if (url.pathname !== path) {
        // 关键：不要在这里直接 destroy，避免拦截/破坏其他 upgrade handler（例如 dev server 的 HMR WS）。
        return;
      }

      if (DEBUG_RUNTIME_WS) {
        // 中文注释：兼容旧 query param electronClientId，但项目内部统一改为 appId。
        const appIdFromQuery =
          url.searchParams.get("appId") ??
          url.searchParams.get("electronClientId") ??
          undefined;
        console.log("[runtime-ws] upgrade", {
          path: url.pathname,
          appId: appIdFromQuery,
          remoteAddress: (req.socket as any)?.remoteAddress,
        });
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit("connection", ws, req);
      });
    });
  }

  /**
   * 向指定 Electron runtime 下发 openPage，并等待回执。
   */
  async openPageOnElectron(input: {
    appId: string;
    pageTargetId: string;
    url: string;
    tabId: string;
    title?: string;
    timeoutMs?: number;
  }): Promise<RuntimeOpenPageResult> {
    const requestId = crypto.randomUUID();
    const cmd: RuntimeOpenPageCommand = {
      kind: "openPage",
      requestId,
      pageTargetId: input.pageTargetId,
      url: input.url,
      tabId: input.tabId,
      title: input.title,
    };

    const ack = await this.sendCommandToElectron({
      appId: input.appId,
      requestId,
      command: cmd,
      timeoutMs: input.timeoutMs ?? 15_000,
    });

    if (!ack.ok) {
      throw new Error(ack.error || "Runtime openPage failed");
    }

    const parsed = runtimeOpenPageResultSchema.safeParse(ack.result);
    if (!parsed.success) {
      throw new Error("Runtime openPage returned invalid result");
    }

    return parsed.data;
  }

  /**
   * 让 Electron runtime 通过 IPC 下发一个 UiEvent 给 renderer。
   */
  async emitUiEventOnElectron(input: {
    appId: string;
    event: UiEvent;
    timeoutMs?: number;
  }): Promise<void> {
    const requestId = crypto.randomUUID();
    const ack = await this.sendCommandToElectron({
      appId: input.appId,
      requestId,
      command: { kind: "uiEvent", requestId, event: input.event },
      timeoutMs: input.timeoutMs ?? 8_000,
    });
    if (!ack.ok) {
      throw new Error(ack.error || "Runtime uiEvent failed");
    }
  }

  /**
   * 判断某个 appId 是否在线（用于调度/兜底）。
   */
  hasElectronRuntime(appId: string): boolean {
    return this.runtimesByAppId.has(appId);
  }

  /**
   * 获取 appId 对应的 runtime 连接信息（用于 UI 展示）。
   * - 注意：这是内存态在线信息，server 重启后会清空。
   */
  getElectronRuntimeStatus(appId: string): { connected: boolean; connectedAt?: number; instanceId?: string } {
    const runtime = this.runtimesByAppId.get(appId);
    if (!runtime) return { connected: false };
    return {
      connected: true,
      connectedAt: runtime.connectedAt,
      instanceId: runtime.hello.instanceId,
    };
  }

  private async handleConnection(ws: import("ws").WebSocket, _req: IncomingMessage) {
    let boundAppId: string | null = null;

    if (DEBUG_RUNTIME_WS) {
      console.log("[runtime-ws] connected");
    }

    ws.on("message", (data) => {
      const text = typeof data === "string" ? data : data.toString("utf-8");
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
        // 中文注释：兼容旧 runtime 字段 electronClientId，但项目内部统一改为 appId。
        const appId =
          msg.runtimeType === "electron"
            ? msg.appId ?? (typeof (raw as any)?.electronClientId === "string" ? (raw as any).electronClientId : "")
            : "";

        if (msg.runtimeType === "electron" && !appId) {
          ws.send(
            JSON.stringify({
              type: "helloAck",
              ok: false,
              serverTime: Date.now(),
              error: "Missing appId",
            }),
          );
          return;
        }

        if (msg.runtimeType === "electron") {
          boundAppId = appId;
          this.runtimesByAppId.set(appId, {
            ws,
            hello: { ...msg, appId } as RuntimeHello,
            connectedAt: Date.now(),
          });

          if (DEBUG_RUNTIME_WS) {
            console.log("[runtime-ws] hello", {
              runtimeType: msg.runtimeType,
              appId: boundAppId,
              instanceId: msg.instanceId,
            });
          }
        }

        ws.send(JSON.stringify({ type: "helloAck", ok: true, serverTime: Date.now() }));
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
        return;
      }

      if (msg.type === "ack") {
        this.handleAck(msg);
      }
    });

    ws.on("close", () => {
      if (boundAppId) {
        this.runtimesByAppId.delete(boundAppId);
      }

      if (DEBUG_RUNTIME_WS) {
        console.log("[runtime-ws] closed", {
          appId: boundAppId ?? undefined,
        });
      }
    });
  }

  private handleAck(ack: RuntimeAck) {
    const pending = this.pendingByRequestId.get(ack.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingByRequestId.delete(ack.requestId);
    pending.resolve(ack);
  }

  private async sendCommandToElectron(input: {
    appId: string;
    requestId: string;
    command: RuntimeCommand;
    timeoutMs: number;
  }): Promise<RuntimeAck> {
    const runtime = this.runtimesByAppId.get(input.appId);
    if (!runtime) {
      throw new Error(`Electron runtime offline: appId=${input.appId}`);
    }

    return await new Promise<RuntimeAck>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingByRequestId.delete(input.requestId);
        reject(new Error(`Runtime command timeout: requestId=${input.requestId}`));
      }, input.timeoutMs);

      this.pendingByRequestId.set(input.requestId, {
        appId: input.appId,
        resolve,
        reject,
        timeout,
      });

      const payload = JSON.stringify({ type: "command", command: input.command });
      try {
        runtime.ws.send(payload);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingByRequestId.delete(input.requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

export const browserRuntimeHub = new BrowserRuntimeHub();
