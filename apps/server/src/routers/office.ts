import { t, shieldedProcedure } from "@openloaf/api";
import { z } from "zod";
import {
  OFFICE_ACTIONS,
  OFFICE_APP_TYPES,
} from "@/modules/office/officeTypes";
import type { OfficeCommand } from "@/modules/office/officeTypes";
import {
  registerOfficeClient,
  heartbeatOfficeClient,
} from "@/modules/office/officeRegistry";
import { officeEventBus } from "@/modules/office/officeEvents";
import { resolveOfficeCommandAck } from "@/modules/office/officePending";

const registerSchema = z.object({
  appType: z.enum(OFFICE_APP_TYPES),
  workspaceId: z.string().optional(),
  projectId: z.string().optional(),
  capabilities: z.array(z.enum(OFFICE_ACTIONS)).optional(),
  clientMeta: z.record(z.string(), z.unknown()).optional(),
});

const heartbeatSchema = z.object({
  clientId: z.string().min(1),
});

const subscribeSchema = z.object({
  clientId: z.string().min(1),
});

const ackSchema = z.object({
  commandId: z.string().min(1),
  clientId: z.string().min(1),
  status: z.enum(["success", "failed", "timeout"]),
  output: z.unknown().optional(),
  errorText: z.string().nullable().optional(),
  requestedAt: z.string().optional(),
});

export const officeRouterImplementation = t.router({
  registerClient: shieldedProcedure.input(registerSchema).mutation(({ input }) => {
    return registerOfficeClient(input);
  }),
  heartbeat: shieldedProcedure.input(heartbeatSchema).mutation(({ input }) => {
    const ok = heartbeatOfficeClient(input.clientId);
    return { ok };
  }),
  subscribeCommands: shieldedProcedure
    .input(subscribeSchema)
    .subscription(async function* ({ input }) {
      const queue: OfficeCommand[] = [];
      let resolve: (() => void) | null = null;
      const cleanup = officeEventBus.onCommand((command) => {
        if (command.clientId !== input.clientId) return;
        queue.push(command);
        resolve?.();
      });
      try {
        while (true) {
          if (queue.length === 0) {
            await new Promise<void>((r) => {
              resolve = r;
            });
          }
          while (queue.length > 0) {
            yield queue.shift()!;
          }
        }
      } finally {
        cleanup();
      }
    }),
  ackCommand: shieldedProcedure.input(ackSchema).mutation(({ input }) => {
    const result = resolveOfficeCommandAck({
      commandId: input.commandId,
      clientId: input.clientId,
      status: input.status,
      output: input.output as any,
      errorText: input.errorText ?? null,
      requestedAt: input.requestedAt ?? new Date().toISOString(),
    });
    if (result === "missing") {
      return { ok: false, error: "commandId not pending" };
    }
    return { ok: true, pending: result === "stored" };
  }),
});
