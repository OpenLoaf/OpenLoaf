import type { Hono } from "hono";
import { z } from "zod";
import { resolveFrontendToolPending } from "@/ai/tools/frontend/pendingRegistry";

const ackSchema = z.object({
  toolCallId: z.string().min(1),
  status: z.enum(["success", "failed", "timeout"]),
  output: z.unknown().optional(),
  errorText: z.string().nullable().optional(),
  requestedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "requestedAt must be an ISO datetime string",
  }),
});

/** Register frontend tool ack routes. */
export function registerFrontendToolAckRoutes(app: Hono) {
  app.post("/ai/tools/ack", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = ackSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid payload" }, 400);
    }

    const resolved = resolveFrontendToolPending(parsed.data);
    if (!resolved) {
      return c.json({ ok: false, error: "toolCallId not pending" }, 404);
    }

    return c.json({ ok: true });
  });
}
