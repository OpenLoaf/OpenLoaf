import type { Hono } from "hono";
import { logger } from "@/common/logger";
import { ensureAccessTokenFresh } from "@/modules/auth/authRoutes";
import { fetchModelList } from "@/modules/saas";

type CloudModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Cloud model list payload. */
  data: unknown;
};

/**
 * Register SaaS cloud model routes.
 */
export function registerCloudModelRoutes(app: Hono): void {
  app.get("/llm/models", async (c) => {
    await ensureAccessTokenFresh();
    try {
      const payload = (await fetchModelList()) as CloudModelResponse | null;
      return c.json(payload ?? { success: false, data: [] });
    } catch (error) {
      if (error instanceof Error && error.message === "saas_url_missing") {
        return c.json({ error: "saas_url_missing" }, 500);
      }
      logger.error({ err: error }, "SaaS models request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
  });
}
