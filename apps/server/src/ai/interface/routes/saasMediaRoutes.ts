import type { Hono } from "hono";

/** Register SaaS media proxy routes. */
export function registerSaasMediaRoutes(app: Hono): void {
  app.post("/ai/image", (c) => c.json({ error: "not_implemented" }, 501));
  app.post("/ai/vedio", (c) => c.json({ error: "not_implemented" }, 501));
}
