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
    const saasBaseUrl = getSaasBaseUrl();
    if (!saasBaseUrl) {
      return c.json({ error: "saas_url_missing" }, 500);
    }
    try {
      // 中文注释：允许匿名访问，存在 access token 时再附带鉴权头。
      const accessToken = getAccessToken();
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const response = await fetch(`${saasBaseUrl}/api/llm/models`, {
        headers,
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
