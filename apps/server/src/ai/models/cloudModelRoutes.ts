import type { Context, Hono } from "hono";
import { logger } from "@/common/logger";
import { fetchModelList } from "@/modules/saas";
import type { ModelDefinition } from "@tenas-ai/api/common";
import {
  normalizeCloudChatModels,
  type CloudChatModelsResponse,
} from "@/ai/models/cloudModelMapper";

type CloudModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Cloud model list payload. */
  data: ModelDefinition[];
  /** Optional error message. */
  message?: string;
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
      const payload = (await fetchModelList(accessToken)) as CloudChatModelsResponse | null;
      const models = normalizeCloudChatModels(payload);
      if (!payload || payload.success !== true) {
        return c.json({
          success: false,
          data: [],
          message: payload && "message" in payload ? payload.message : "saas_request_failed",
        } satisfies CloudModelResponse);
      }
      return c.json({ success: true, data: models } satisfies CloudModelResponse);
    } catch (error) {
      if (error instanceof Error && error.message === "saas_url_missing") {
        return c.json({ error: "saas_url_missing" }, 500);
      }
      logger.error({ err: error }, "SaaS models request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
  });
}
