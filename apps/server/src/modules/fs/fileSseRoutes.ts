import type { Hono } from "hono";
import path from "node:path";
import chokidar from "chokidar";
import { resolveWorkspacePathFromUri } from "@teatime-ai/api/services/vfsService";
import { logger } from "@/common/logger";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

type FileWatchPayload = {
  type: "ready" | "fs-change";
  projectId: string;
  dirUri: string;
  event?: string;
  path?: string;
};

/** Register file system SSE routes. */
export function registerFileSseRoutes(app: Hono) {
  app.get("/fs/watch", async (c) => {
    const projectId = c.req.query("projectId")?.trim() ?? "";
    const dirUri = c.req.query("dirUri")?.trim() ?? "";
    if (!projectId || !dirUri) {
      return c.json({ error: "Missing projectId or dirUri" }, 400);
    }

    let fullPath: string;
    try {
      fullPath = resolveWorkspacePathFromUri(dirUri);
    } catch (error) {
      logger.warn({ err: error }, "[fs] invalid dirUri");
      return c.json({ error: "Invalid dirUri" }, 400);
    }

    const stream = new ReadableStream({
      start(controller) {
        const send = (payload: FileWatchPayload) => {
          controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
        };

        send({ type: "ready", projectId, dirUri });

        const watcher = chokidar.watch(fullPath, {
          ignoreInitial: true,
          persistent: true,
          depth: 0,
        });

        let debounceTimer: NodeJS.Timeout | null = null;
        let pendingPayload: FileWatchPayload | null = null;

        watcher.on("all", (eventName, changedPath) => {
          const relativePath = path.relative(fullPath, changedPath);
          pendingPayload = {
            type: "fs-change",
            projectId,
            dirUri,
            event: eventName,
            path: relativePath,
          };

          if (debounceTimer) return;
          // 中文注释：1 秒内只发送一次，避免频繁刷新触发抖动。
          debounceTimer = setTimeout(() => {
            if (pendingPayload) {
              send(pendingPayload);
              pendingPayload = null;
            }
            if (debounceTimer) {
              clearTimeout(debounceTimer);
              debounceTimer = null;
            }
          }, 1000);
        });

        const cleanup = async () => {
          try {
            await watcher.close();
          } catch (error) {
            logger.warn({ err: error }, "[fs] watcher close failed");
          }
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          try {
            controller.close();
          } catch {
            // ignore
          }
        };

        const signal = c.req.raw.signal;
        if (signal.aborted) {
          void cleanup();
          return;
        }
        signal.addEventListener("abort", cleanup, { once: true });
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  });
}
