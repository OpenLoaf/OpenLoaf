import assert from "node:assert/strict";

import { Hono } from "hono";
import { SaaSHttpError } from "@tenas-saas/sdk/server";

import { logger } from "../../../../common/logger.ts";
import { handleSaasMediaRoute } from "../saasMediaRoutes.ts";

const app = new Hono();
const logged: unknown[] = [];

const originalError = logger.error.bind(logger);
logger.error = ((...args: unknown[]) => {
  logged.push(args);
  return undefined;
}) as typeof logger.error;

try {
  app.post("/ai/test", (c) =>
    handleSaasMediaRoute(c, async () => {
      throw new SaaSHttpError("Request failed", {
        status: 400,
        statusText: "Bad Request",
        payload: { message: "bad" },
      });
    }),
  );

  const response = await app.request("/ai/test", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
    },
    body: JSON.stringify({ prompt: "test" }),
  });

  assert.equal(response.status, 400);
  assert.ok(logged.length > 0);
  const firstCall = logged[0] as unknown[];
  const payload = (firstCall[0] as { payload?: unknown }).payload;
  assert.deepEqual(payload, { message: "bad" });
} finally {
  logger.error = originalError;
}

console.log("saas media error logging test passed.");
