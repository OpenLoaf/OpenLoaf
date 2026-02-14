import type { Context, Hono } from "hono";
import { logger } from "@/common/logger";
import { fetchModelList, fetchModelsUpdatedAt } from "@/modules/saas";
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
  /** Source updated-at timestamp from SaaS. */
  updatedAt?: string;
  /** Optional error message. */
  message?: string;
};

type CloudModelUpdatedAtResponse = {
  /** Response success flag. */
  success: boolean;
  /** Aggregated updated-at payload. */
  data?: {
    chatUpdatedAt: string;
    imageUpdatedAt: string;
    videoUpdatedAt: string;
    latestUpdatedAt: string;
  };
  /** Optional error message. */
  message?: string;
};

type CloudModelRouteDeps = {
  /** Override SaaS model list fetcher for tests. */
  fetchModelList?: typeof fetchModelList;
  /** Override SaaS updated-at fetcher for tests. */
  fetchModelsUpdatedAt?: typeof fetchModelsUpdatedAt;
};

/** Extract bearer token from request headers. */
function resolveBearerToken(c: Context): string | null {
  const authHeader = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Resolve force refresh query flag. */
function resolveForceRefresh(queryValue?: string): boolean {
  if (!queryValue) return false;
  const normalized = queryValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/**
 * Register SaaS cloud model routes.
 */
export function registerCloudModelRoutes(
  app: Hono,
  deps: CloudModelRouteDeps = {},
): void {
  const fetchModelListHandler = deps.fetchModelList ?? fetchModelList;
  const fetchModelsUpdatedAtHandler = deps.fetchModelsUpdatedAt ?? fetchModelsUpdatedAt;

  app.get("/llm/models/updated-at", async (c) => {
    const accessToken = resolveBearerToken(c) ?? "";
    try {
      const payload = await fetchModelsUpdatedAtHandler(accessToken);
      if (!payload || payload.success !== true) {
        return c.json({
          success: false,
          message: payload && "message" in payload ? payload.message : "saas_request_failed",
        } satisfies CloudModelUpdatedAtResponse);
      }
      return c.json({
        success: true,
        data: payload.data,
      } satisfies CloudModelUpdatedAtResponse);
    } catch (error) {
      if (error instanceof Error && error.message === "saas_url_missing") {
        return c.json({ error: "saas_url_missing" }, 500);
      }
      logger.error({ err: error }, "SaaS models updated-at request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
  });

  app.get("/llm/models", async (c) => {
    const accessToken = resolveBearerToken(c) ?? "";
    const force = resolveForceRefresh(c.req.query("force"));
    try {
      const payload = (await fetchModelListHandler(accessToken, {
        force,
      })) as CloudChatModelsResponse | null;
      const models = normalizeCloudChatModels(payload);
      if (!payload || payload.success !== true) {
        return c.json({
          success: false,
          data: [],
          message: payload && "message" in payload ? payload.message : "saas_request_failed",
        } satisfies CloudModelResponse);
      }
      return c.json({
        success: true,
        data: models,
        updatedAt: payload.data.updatedAt,
      } satisfies CloudModelResponse);
    } catch (error) {
      if (error instanceof Error && error.message === "saas_url_missing") {
        return c.json({ error: "saas_url_missing" }, 500);
      }
      logger.error({ err: error }, "SaaS models request failed");
      return c.json({ error: "saas_request_failed" }, 502);
    }
  });
}
