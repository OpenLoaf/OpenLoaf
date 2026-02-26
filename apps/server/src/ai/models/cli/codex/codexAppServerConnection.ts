/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import { logger } from "@/common/logger";
import { clearAllCodexThreads } from "@/ai/models/cli/codex/codexThreadStore";

type JsonRpcRequest = {
  /** Request id. */
  id: string;
  /** Method name. */
  method: string;
  /** Request params. */
  params?: unknown;
};

type JsonRpcResponse = {
  /** Request id. */
  id: string;
  /** Result payload. */
  result?: unknown;
  /** Error payload. */
  error?: { message?: string; code?: number; data?: unknown };
};

type JsonRpcNotification = {
  /** Notification method. */
  method: string;
  /** Notification params. */
  params?: unknown;
};

type PendingRequest = {
  /** Resolve promise for the request. */
  resolve: (value: unknown) => void;
  /** Reject promise for the request. */
  reject: (error: Error) => void;
};

type NotificationHandler = (message: JsonRpcNotification) => void;

type ServerRequestHandler = (message: JsonRpcRequest) => void;

/** Resolve the Codex CLI executable path. */
function resolveCodexCommand(): string {
  const override = process.env.CODEX_CLI_PATH?.trim();
  if (override) return override;
  return "codex";
}

/** Build client info for Codex app-server initialization. */
function buildClientInfo(): { name: string; title: string; version: string } {
  const version = process.env.npm_package_version ?? "0.0.0";
  return { name: "openloaf", title: "OpenLoaf AI", version };
}

/** Default approval decision for v2 approvals. */
const DEFAULT_APPROVAL_DECISION = "decline";
/** Default approval decision for legacy approvals. */
const LEGACY_APPROVAL_DECISION = "denied";

/** Manage a single Codex app-server process. */
class CodexAppServerConnection {
  /** Active app-server process handle. */
  private child: ChildProcessWithoutNullStreams | null = null;
  /** Next request id counter. */
  private nextRequestId = 0;
  /** Pending request map. */
  private pending = new Map<string, PendingRequest>();
  /** Notification handlers. */
  private notificationHandlers = new Set<NotificationHandler>();
  /** Server request handlers. */
  private requestHandlers = new Set<ServerRequestHandler>();
  /** Initialization promise. */
  private initPromise: Promise<void> | null = null;

  /** Ensure app-server is started and initialized. */
  async ensureInitialized(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  /** Send a JSON-RPC request to the app-server. */
  async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    await this.ensureInitialized();
    return this.sendRequestInternal<T>(method, params);
  }

  /** Subscribe to JSON-RPC notifications from the app-server. */
  subscribeNotifications(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => {
      this.notificationHandlers.delete(handler);
    };
  }

  /** Subscribe to JSON-RPC requests from the app-server. */
  subscribeRequests(handler: ServerRequestHandler): () => void {
    this.requestHandlers.add(handler);
    return () => {
      this.requestHandlers.delete(handler);
    };
  }

  /** Initialize the app-server process and handshake. */
  private async initialize(): Promise<void> {
    this.spawnProcess();
    const clientInfo = buildClientInfo();
    await this.sendRequestInternal("initialize", { clientInfo });
  }

  /** Spawn the Codex app-server process. */
  private spawnProcess(): void {
    if (this.child) return;
    const command = resolveCodexCommand();
    const child = spawn(command, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    child.once("error", (error) => {
      logger.warn({ err: error }, "[cli] codex app-server spawn failed");
    });

    child.once("exit", (code, signal) => {
      logger.warn({ code, signal }, "[cli] codex app-server exited");
      this.handleProcessExit(new Error("Codex app-server exited"));
    });

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        const message = String(chunk).trim();
        if (message) logger.debug({ message }, "[cli] codex app-server stderr");
      });
    }

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      this.handleIncomingLine(trimmed);
    });
  }

  /** Handle a process-level failure and reset state. */
  private handleProcessExit(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      pending.reject(error);
      this.pending.delete(id);
    }
    this.child?.removeAllListeners();
    this.child = null;
    this.initPromise = null;
    clearAllCodexThreads();
  }

  /** Handle raw JSON lines from the app-server. */
  private handleIncomingLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      logger.warn({ line, err: error }, "[cli] codex app-server invalid json");
      return;
    }
    if (this.isResponseMessage(message)) {
      this.handleResponse(message);
      return;
    }
    if (this.isRequestMessage(message)) {
      this.handleRequest(message);
      return;
    }
    if (this.isNotificationMessage(message)) {
      this.handleNotification(message);
      return;
    }
    logger.debug({ message }, "[cli] codex app-server unknown message");
  }

  /** Handle JSON-RPC response messages. */
  private handleResponse(message: JsonRpcResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      const errorMessage = message.error.message ?? "Codex app-server error";
      pending.reject(new Error(errorMessage));
      return;
    }
    pending.resolve(message.result);
  }

  /** Handle JSON-RPC request messages from the server. */
  private handleRequest(message: JsonRpcRequest): void {
    for (const handler of this.requestHandlers) {
      handler(message);
    }
    if (message.method === "item/commandExecution/requestApproval") {
      this.sendResponse(message.id, { decision: DEFAULT_APPROVAL_DECISION });
      return;
    }
    if (message.method === "item/fileChange/requestApproval") {
      this.sendResponse(message.id, { decision: DEFAULT_APPROVAL_DECISION });
      return;
    }
    if (message.method === "applyPatchApproval") {
      this.sendResponse(message.id, { decision: LEGACY_APPROVAL_DECISION });
      return;
    }
    if (message.method === "execCommandApproval") {
      this.sendResponse(message.id, { decision: LEGACY_APPROVAL_DECISION });
      return;
    }
    logger.warn({ method: message.method }, "[cli] codex app-server unsupported request");
    this.sendResponse(message.id, { decision: DEFAULT_APPROVAL_DECISION });
  }

  /** Handle JSON-RPC notifications from the server. */
  private handleNotification(message: JsonRpcNotification): void {
    for (const handler of this.notificationHandlers) {
      handler(message);
    }
  }

  /** Send a JSON-RPC request without init guards. */
  private sendRequestInternal<T>(method: string, params?: unknown): Promise<T> {
    const id = String((this.nextRequestId += 1));
    const payload: JsonRpcRequest = { id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.sendMessage(payload);
    });
  }

  /** Send a JSON-RPC response back to the server. */
  private sendResponse(id: string, result: unknown): void {
    const payload: JsonRpcResponse = { id, result };
    this.sendMessage(payload);
  }

  /** Send a raw JSON-RPC message to the server. */
  private sendMessage(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): void {
    const child = this.child;
    if (!child || !child.stdin || child.stdin.destroyed) {
      logger.warn({ message }, "[cli] codex app-server stdin unavailable");
      return;
    }
    const serialized = JSON.stringify(message);
    child.stdin.write(`${serialized}\n`);
  }

  /** Check whether a message is a JSON-RPC response. */
  private isResponseMessage(message: unknown): message is JsonRpcResponse {
    return Boolean(
      message &&
        typeof message === "object" &&
        "id" in message &&
        ("result" in message || "error" in message),
    );
  }

  /** Check whether a message is a JSON-RPC request. */
  private isRequestMessage(message: unknown): message is JsonRpcRequest {
    return Boolean(
      message && typeof message === "object" && "id" in message && "method" in message,
    );
  }

  /** Check whether a message is a JSON-RPC notification. */
  private isNotificationMessage(message: unknown): message is JsonRpcNotification {
    return Boolean(message && typeof message === "object" && "method" in message && !("id" in message));
  }
}

/** Singleton accessor for Codex app-server connection. */
export function getCodexAppServerConnection(): CodexAppServerConnection {
  if (!globalThis.__codexAppServerConnection) {
    globalThis.__codexAppServerConnection = new CodexAppServerConnection();
  }
  return globalThis.__codexAppServerConnection;
}

declare global {
  /** Global singleton for Codex app-server connection. */
  // eslint-disable-next-line no-var
  var __codexAppServerConnection: CodexAppServerConnection | undefined;
}
