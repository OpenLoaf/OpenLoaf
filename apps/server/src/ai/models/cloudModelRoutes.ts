import type { Context, Hono } from "hono";
import { logger } from "@/common/logger";
import { fetchModelList } from "@/modules/saas";

type CloudModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Cloud model list payload. */
  data: unknown;
};

/** Extract bearer token from request headers. */
function resolveBearerToken(c: Context): string | null {
  const authHeader = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Register SaaS cloud model routes.
 */
export function registerCloudModelRoutes(app: Hono): void {
  app.get("/llm/models", async (c) => {
    const accessToken = resolveBearerToken(c);
    if (!accessToken) {
      return c.json({ error: "saas_auth_required" }, 401);
    }
    try {
      const payload = (await fetchModelList(accessToken)) as CloudModelResponse | null;
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
