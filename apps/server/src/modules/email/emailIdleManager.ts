import Imap from "imap";

import { prisma } from "@tenas-ai/db";
import { logger } from "@/common/logger";
import { getWorkspaces } from "@tenas-ai/api/services/workspaceConfig";
import { readEmailConfigFile } from "./emailConfigStore";
import { getEmailEnvValue } from "./emailEnvStore";
import { syncRecentMailboxMessages } from "./emailSyncService";

const IDLE_ENABLED_ENV_KEY = "EMAIL_IDLE_ENABLED";
const IDLE_MAILBOX_ENV_KEY = "EMAIL_IDLE_MAILBOX";
const IDLE_SYNC_LIMIT_ENV_KEY = "EMAIL_IDLE_SYNC_LIMIT";
const SKIP_IMAP_ENV_KEY = "EMAIL_IMAP_SKIP";

const DEFAULT_IDLE_MAILBOX = "INBOX";
const DEFAULT_IDLE_SYNC_LIMIT = 50;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 60000;

type WorkerStatus = "idle" | "connecting" | "error" | "stopped" | "skipped";

type EmailIdleWorker = {
  key: string;
  workspaceId: string;
  accountEmail: string;
  status: WorkerStatus;
  lastError?: string;
  reconnectDelayMs: number;
  reconnectTimer?: NodeJS.Timeout;
  imap?: Imap;
  stopRequested: boolean;
  isSyncing: boolean;
  pendingSync: boolean;
};

type EmailIdleManagerSnapshot = {
  enabled: boolean;
  workerCount: number;
  workers: Array<{
    workspaceId: string;
    accountEmail: string;
    status: WorkerStatus;
    lastError?: string;
  }>;
};

/** Check if idle is enabled. */
function isIdleEnabled(): boolean {
  const raw = process.env[IDLE_ENABLED_ENV_KEY];
  if (!raw) return true;
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

/** Check if IMAP operations should be skipped. */
function shouldSkipImapOperations(): boolean {
  const raw = process.env[SKIP_IMAP_ENV_KEY];
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "on", "yes"].includes(normalized);
}

/** Resolve idle mailbox path. */
function getIdleMailboxPath(): string {
  return process.env[IDLE_MAILBOX_ENV_KEY]?.trim() || DEFAULT_IDLE_MAILBOX;
}

/** Resolve idle sync limit. */
function getIdleSyncLimit(): number {
  const raw = Number(process.env[IDLE_SYNC_LIMIT_ENV_KEY] ?? DEFAULT_IDLE_SYNC_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_IDLE_SYNC_LIMIT;
  return Math.min(Math.max(raw, 1), 200);
}

/** Normalize email address for matching. */
function normalizeEmailAddress(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
}

/** Resolve email account and password from configuration. */
function resolveEmailAccountCredential(workspaceId: string, accountEmail: string) {
  const normalizedEmail = normalizeEmailAddress(accountEmail);
  const config = readEmailConfigFile(workspaceId);
  const account = config.emailAccounts.find(
    (item) => normalizeEmailAddress(item.emailAddress) === normalizedEmail,
  );
  if (!account) {
    throw new Error("Email account not found.");
  }
  const password = getEmailEnvValue(account.auth.envKey);
  if (!password) {
    throw new Error("Email password not configured.");
  }
  return { account, password, normalizedEmail };
}

/** Connect to IMAP server and wait until ready. */
async function connectImap(imap: Imap): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    imap.once("ready", resolve);
    imap.once("error", reject);
    imap.connect();
  });
}

/** Open IMAP mailbox. */
async function openMailbox(imap: Imap, mailboxPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    imap.openBox(mailboxPath, true, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/** Safely invoke IMAP idle when available. */
function tryImapIdle(imap: Imap): void {
  const idle = (imap as Imap & { idle?: () => void }).idle;
  if (typeof idle === "function") {
    idle.call(imap);
  }
}

/** Build a worker key. */
function buildWorkerKey(workspaceId: string, accountEmail: string): string {
  return `${workspaceId}:${normalizeEmailAddress(accountEmail)}`;
}

/** Build manager snapshot. */
function toSnapshot(enabled: boolean, workers: Map<string, EmailIdleWorker>): EmailIdleManagerSnapshot {
  return {
    enabled,
    workerCount: workers.size,
    workers: Array.from(workers.values()).map((worker) => ({
      workspaceId: worker.workspaceId,
      accountEmail: worker.accountEmail,
      status: worker.status,
      lastError: worker.lastError,
    })),
  };
}

class EmailIdleManager {
  private enabled = true;
  private workers = new Map<string, EmailIdleWorker>();

  /** Start idle connections for all accounts. */
  public async start(): Promise<void> {
    if (!isIdleEnabled()) {
      this.enabled = false;
      logger.info("email idle disabled by env");
      return;
    }
    this.enabled = true;
    const workspaces = getWorkspaces();
    for (const workspace of workspaces) {
      const config = readEmailConfigFile(workspace.id);
      for (const account of config.emailAccounts) {
        const key = buildWorkerKey(workspace.id, account.emailAddress);
        if (this.workers.has(key)) continue;
        const worker: EmailIdleWorker = {
          key,
          workspaceId: workspace.id,
          accountEmail: account.emailAddress,
          status: "connecting",
          reconnectDelayMs: RECONNECT_BASE_MS,
          stopRequested: false,
          isSyncing: false,
          pendingSync: false,
        };
        this.workers.set(key, worker);
        this.connectWorker(worker);
      }
    }
  }

  /** Stop idle connections. */
  public async stop(): Promise<void> {
    const workers = Array.from(this.workers.values());
    for (const worker of workers) {
      worker.stopRequested = true;
      if (worker.reconnectTimer) {
        clearTimeout(worker.reconnectTimer);
      }
      if (worker.imap) {
        try {
          worker.imap.end();
        } catch {
          // ignore
        }
      }
      worker.status = "stopped";
    }
    this.workers.clear();
  }

  /** Return a snapshot of current workers. */
  public snapshot(): EmailIdleManagerSnapshot {
    return toSnapshot(this.enabled, this.workers);
  }

  private scheduleReconnect(worker: EmailIdleWorker, reason: string) {
    if (worker.stopRequested) return;
    if (worker.reconnectTimer) return;
    worker.status = "error";
    logger.warn(
      { accountEmail: worker.accountEmail, reason, delayMs: worker.reconnectDelayMs },
      "email idle reconnect scheduled",
    );
    const delay = worker.reconnectDelayMs;
    worker.reconnectDelayMs = Math.min(worker.reconnectDelayMs * 2, RECONNECT_MAX_MS);
    worker.reconnectTimer = setTimeout(() => {
      worker.reconnectTimer = undefined;
      this.connectWorker(worker);
    }, delay);
  }

  private async connectWorker(worker: EmailIdleWorker) {
    if (worker.stopRequested) return;
    if (shouldSkipImapOperations()) {
      worker.status = "skipped";
      return;
    }
    try {
      worker.status = "connecting";
      const { account, password, normalizedEmail } = resolveEmailAccountCredential(
        worker.workspaceId,
        worker.accountEmail,
      );
      const imap = new Imap({
        user: account.emailAddress,
        password,
        host: account.imap.host,
        port: account.imap.port,
        tls: account.imap.tls,
      });
      worker.imap = imap;
      imap.on("error", (error) => {
        worker.lastError = error instanceof Error ? error.message : "IMAP error";
        logger.error(
          { err: error, accountEmail: normalizedEmail },
          "email idle imap error",
        );
        this.scheduleReconnect(worker, "error");
      });
      imap.on("close", (hadError) => {
        if (worker.stopRequested) {
          logger.debug(
            { accountEmail: normalizedEmail, hadError },
            "email idle imap closed (stopped)",
          );
          return;
        }
        logger.warn(
          { accountEmail: normalizedEmail, hadError },
          "email idle imap closed",
        );
        this.scheduleReconnect(worker, "close");
      });
      imap.on("end", () => {
        if (worker.stopRequested) {
          logger.debug(
            { accountEmail: normalizedEmail },
            "email idle imap ended (stopped)",
          );
          return;
        }
        logger.warn({ accountEmail: normalizedEmail }, "email idle imap ended");
        this.scheduleReconnect(worker, "end");
      });
      imap.on("mail", () => {
        this.triggerSync(worker);
      });
      await connectImap(imap);
      if (!imap.serverSupports("IDLE")) {
        worker.status = "skipped";
        worker.stopRequested = true;
        logger.warn({ accountEmail: normalizedEmail }, "email idle unsupported");
        try {
          imap.end();
        } catch {
          // ignore
        }
        return;
      }
      await openMailbox(imap, getIdleMailboxPath());
      worker.status = "idle";
      worker.reconnectDelayMs = RECONNECT_BASE_MS;
      try {
        tryImapIdle(imap);
        logger.info({ accountEmail: normalizedEmail }, "email idle ready");
      } catch (error) {
        worker.lastError = error instanceof Error ? error.message : "IMAP idle error";
        worker.status = "skipped";
        worker.stopRequested = true;
        logger.warn(
          { accountEmail: normalizedEmail, reason: "idle", err: worker.lastError },
          "email idle disabled",
        );
        try {
          imap.end();
        } catch {
          // ignore
        }
      }
    } catch (error) {
      worker.lastError = error instanceof Error ? error.message : "IMAP connect error";
      logger.error(
        { err: error, accountEmail: worker.accountEmail },
        "email idle connect failed",
      );
      this.scheduleReconnect(worker, "connect");
    }
  }

  private async triggerSync(worker: EmailIdleWorker) {
    if (worker.stopRequested) return;
    if (worker.isSyncing) {
      worker.pendingSync = true;
      return;
    }
    worker.isSyncing = true;
    try {
      await syncRecentMailboxMessages({
        prisma,
        workspaceId: worker.workspaceId,
        accountEmail: worker.accountEmail,
        mailboxPath: getIdleMailboxPath(),
        limit: getIdleSyncLimit(),
      });
    } catch (error) {
      worker.lastError = error instanceof Error ? error.message : "Sync failed";
      logger.error(
        { err: error, accountEmail: worker.accountEmail },
        "email idle sync failed",
      );
    } finally {
      worker.isSyncing = false;
      if (worker.pendingSync) {
        worker.pendingSync = false;
        setTimeout(() => this.triggerSync(worker), 0);
      }
      if (worker.imap) {
        try {
          tryImapIdle(worker.imap);
        } catch {
          // ignore
        }
      }
    }
  }
}

let idleManager: EmailIdleManager | null = null;

/** Start the email idle manager. */
export async function startEmailIdleManager(): Promise<void> {
  if (!idleManager) {
    idleManager = new EmailIdleManager();
  }
  await idleManager.start();
}

/** Stop the email idle manager. */
export async function stopEmailIdleManager(): Promise<void> {
  if (!idleManager) return;
  await idleManager.stop();
  idleManager = null;
}

/** Get the email idle manager snapshot. */
export function getEmailIdleManagerSnapshot(): EmailIdleManagerSnapshot {
  if (!idleManager) {
    return { enabled: false, workerCount: 0, workers: [] };
  }
  return idleManager.snapshot();
}
