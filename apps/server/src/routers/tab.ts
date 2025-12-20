import { BaseTabRouter, tabSchemas, t, shieldedProcedure } from "@teatime-ai/api";
import { buildTabSnapshotCacheKey, getTabSnapshot, upsertTabSnapshot } from "../context/tabSnapshotCache";

export class TabRouterImpl extends BaseTabRouter {
  public static createRouter() {
    return t.router({
      upsertSnapshot: shieldedProcedure
        .input(tabSchemas.upsertSnapshot.input)
        .output(tabSchemas.upsertSnapshot.output)
        .mutation(async ({ input }) => {
          const key = buildTabSnapshotCacheKey({
            sessionId: input.sessionId,
            clientId: input.clientId,
            tabId: input.tabId,
          });

          upsertTabSnapshot({ key, seq: input.seq, tab: input.tab });
          return { ok: true };
        }),

      getSnapshot: shieldedProcedure
        .input(tabSchemas.getSnapshot.input)
        .output(tabSchemas.getSnapshot.output)
        .query(async ({ input }) => {
          const key = buildTabSnapshotCacheKey({
            sessionId: input.sessionId,
            clientId: input.clientId,
            tabId: input.tabId,
          });
          const tab = getTabSnapshot(key);
          return { ok: true, tab };
        }),
    });
  }
}

export const tabRouterImplementation = TabRouterImpl.createRouter();
