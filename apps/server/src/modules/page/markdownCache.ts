import { prisma } from "@teatime-ai/db";
import { refreshAllPageMarkdownCache } from "@teatime-ai/api";
import { logger } from "@/common/logger";

const MARKDOWN_CACHE_INTERVAL_MS = 5 * 60 * 1000;

/** Start periodic markdown cache refresh. */
export const startPageMarkdownCache = () => {
  const interval = setInterval(async () => {
    try {
      // 定时刷新 Markdown 缓存，避免读取时集中重算
      const result = await refreshAllPageMarkdownCache(prisma);
      if (result.updated > 0) {
        logger.info({ updated: result.updated }, "Page markdown cache refreshed");
      }
    } catch (error) {
      logger.error({ error }, "Page markdown cache refresh failed");
    }
  }, MARKDOWN_CACHE_INTERVAL_MS);

  interval.unref?.();
};
