/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport {
  BaseTerminalRouter,
  terminalSchemas,
  t,
  shieldedProcedure,
} from "@openloaf/api";
import {
  closeTerminalSession,
  createTerminalSession,
  isTerminalEnabled,
} from "@/modules/terminal/terminalSessionManager";

export class TerminalRouterImpl extends BaseTerminalRouter {
  /** Terminal tRPC endpoints for session lifecycle. */
  public static createRouter() {
    return t.router({
      getStatus: shieldedProcedure
        .output(terminalSchemas.getStatus.output)
        .query(async () => {
          return { enabled: isTerminalEnabled() };
        }),
      createSession: shieldedProcedure
        .input(terminalSchemas.createSession.input)
        .output(terminalSchemas.createSession.output)
        .mutation(async ({ input }) => {
          if (!isTerminalEnabled()) throw new Error("Terminal feature is disabled.");
          return createTerminalSession(input);
        }),
      closeSession: shieldedProcedure
        .input(terminalSchemas.closeSession.input)
        .output(terminalSchemas.closeSession.output)
        .mutation(async ({ input }) => {
          if (!isTerminalEnabled()) throw new Error("Terminal feature is disabled.");
          const ok = closeTerminalSession({ sessionId: input.sessionId, token: input.token });
          if (!ok) throw new Error("Terminal session not found.");
          return { ok: true };
        }),
    });
  }
}

export const terminalRouterImplementation = TerminalRouterImpl.createRouter();
