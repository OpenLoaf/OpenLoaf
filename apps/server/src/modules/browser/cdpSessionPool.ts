/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getCdpConfig } from "@openloaf/config";

const SESSION_IDLE_TTL_MS = 10 * 60 * 1000;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
};

type CdpWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
};

class CdpSession {
  private readonly targetId: string;
  private readonly wsUrl: string;
  private ws: CdpWebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private lastActiveAt = Date.now();

  constructor(input: { targetId: string; wsUrl: string }) {
    this.targetId = input.targetId;
    this.wsUrl = input.wsUrl;
  }

  /** Send a CDP command and await the response. */
  async send(method: string, params?: Record<string, unknown>) {
    const ws = await this.ensureOpen();
    const id = this.nextId++;

    this.lastActiveAt = Date.now();

    return new Promise((resolve, reject) => {
      // 统一用超时兜底，避免 pending 堆积。
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15_000);

      this.pending.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Close the current session and reject pending commands. */
  close(reason: string) {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error(reason));
      if (pending.timeout) clearTimeout(pending.timeout);
    }
    this.pending.clear();
  }

  /** Check whether the session is idle. */
  isIdle(now: number) {
    return now - this.lastActiveAt > SESSION_IDLE_TTL_MS;
  }

  /** Ensure the websocket is open before sending commands. */
  private async ensureOpen(): Promise<CdpWebSocket> {
    if (this.ws && this.ws.readyState === 1) return this.ws;

    const WebSocketImpl = (globalThis as any).WebSocket as (new (url: string) => CdpWebSocket) | undefined;
    if (!WebSocketImpl) {
      throw new Error("WebSocket is not available in the server runtime.");
    }

    // 按需建立连接，避免重复握手。
    const ws = await new Promise<CdpWebSocket>((resolve, reject) => {
      const socket = new WebSocketImpl(this.wsUrl);
      socket.addEventListener("open", () => resolve(socket));
      socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed.")));
    });

    ws.addEventListener("message", (event) => {
      this.lastActiveAt = Date.now();
      const raw = typeof event?.data === "string" ? event.data : "";
      if (!raw) return;

      let payload: any;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      const id = Number(payload?.id ?? 0);
      if (!id) return;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (pending.timeout) clearTimeout(pending.timeout);

      if (payload?.error) {
        pending.reject(new Error(payload.error.message ?? "CDP error"));
      } else {
        pending.resolve(payload?.result);
      }
    });

    ws.addEventListener("close", () => {
      this.close("CDP WebSocket closed");
    });

    this.ws = ws;
    return ws;
  }
}

const sessionPool = new Map<string, CdpSession>();

/** Cleanup idle sessions from the pool. */
function cleanupIdleSessions(now: number) {
  for (const [targetId, session] of sessionPool.entries()) {
    if (!session.isIdle(now)) continue;
    // 清理长时间未使用的连接，避免 WebSocket 泄漏。
    session.close("CDP session idle");
    sessionPool.delete(targetId);
  }
}

/**
 * Resolve a CDP session for a given targetId.
 */
export function getCdpSession(input: { targetId: string; wsUrl: string }) {
  const now = Date.now();
  cleanupIdleSessions(now);

  const existing = sessionPool.get(input.targetId);
  if (existing) return existing;

  const session = new CdpSession({ targetId: input.targetId, wsUrl: input.wsUrl });
  sessionPool.set(input.targetId, session);
  return session;
}

/**
 * Get the current CDP base URL for debugging purposes.
 */
export function getCdpBaseUrl() {
  const config = getCdpConfig();
  return config.baseUrl;
}
