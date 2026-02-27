/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

export const terminalSchemas = {
  /** Get terminal feature status. */
  getStatus: {
    output: z.object({
      enabled: z.boolean(),
    }),
  },
  /** Create a terminal session for a given working directory. */
  createSession: {
    input: z.object({
      /** Working directory path or file:// URI. */
      pwd: z.string().min(1),
      /** Optional initial terminal columns. */
      cols: z.number().int().min(10).max(400).optional(),
      /** Optional initial terminal rows. */
      rows: z.number().int().min(5).max(200).optional(),
    }),
    output: z.object({
      /** Session id used for websocket attachment. */
      sessionId: z.string().min(1),
      /** Session token required for websocket attachment. */
      token: z.string().min(1),
    }),
  },
  /** Close a terminal session. */
  closeSession: {
    input: z.object({
      /** Session id to close. */
      sessionId: z.string().min(1),
      /** Session token for validation. */
      token: z.string().min(1),
    }),
    output: z.object({ ok: z.literal(true) }),
  },
};

export abstract class BaseTerminalRouter {
  /** Router name for terminal endpoints. */
  public static routeName = "terminal";

  /** Define the terminal router contract. */
  public static createRouter() {
    return t.router({
      getStatus: shieldedProcedure
        .output(terminalSchemas.getStatus.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      createSession: shieldedProcedure
        .input(terminalSchemas.createSession.input)
        .output(terminalSchemas.createSession.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      closeSession: shieldedProcedure
        .input(terminalSchemas.closeSession.input)
        .output(terminalSchemas.closeSession.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const terminalRouter = BaseTerminalRouter.createRouter();
export type TerminalRouter = typeof terminalRouter;
