import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "@/common/logger";
import { ensureAccessTokenFresh, getSaasBaseUrl } from "@/modules/auth/authRoutes";
import { getAccessToken } from "@/modules/auth/tokenStore";

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
    const accessToken = getAccessToken();
    if (!accessToken) {
      return c.json({ error: "auth_required" }, 401);
    }
    const saasBaseUrl = getSaasBaseUrl();
    if (!saasBaseUrl) {
      return c.json({ error: "saas_url_missing" }, 500);
    }
    try {
      const response = await fetch(`${saasBaseUrl}/api/llm/models`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as CloudModelResponse | null;
      if (!response.ok) {
        // 中文注释：SaaS 返回非 2xx 时记录状态码便于排查。
        logger.warn({ status: response.status, payload }, "SaaS models request failed");
        return c.json({ error: "saas_request_failed" }, response.status as ContentfulStatusCode);
      }
      return c.json(payload ?? { success: false, data: [] });
    } catch (error) {
      logger.error({ err: error }, "SaaS models request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
  });
}
