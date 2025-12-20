import { BaseTabRouter, tabSchemas, t, shieldedProcedure } from "@teatime-ai/api";
import { tabSnapshotStore } from "@/modules/tab/infrastructure/memory/tabSnapshotStoreMemory";

export class TabRouterImpl extends BaseTabRouter {
  /** Tab 快照读写（MVP）：server 侧 TTL 缓存。 */
  public static createRouter() {
    return t.router({
      upsertSnapshot: shieldedProcedure
        .input(tabSchemas.upsertSnapshot.input)
        .output(tabSchemas.upsertSnapshot.output)
        .mutation(async ({ input }) => {
          tabSnapshotStore.upsert({
            sessionId: input.sessionId,
            clientId: input.clientId,
            tabId: input.tabId,
            seq: input.seq,
            tab: input.tab,
          });
          return { ok: true };
        }),

      getSnapshot: shieldedProcedure
        .input(tabSchemas.getSnapshot.input)
        .output(tabSchemas.getSnapshot.output)
        .query(async ({ input }) => {
          const tab = tabSnapshotStore.get({
            sessionId: input.sessionId,
            clientId: input.clientId,
            tabId: input.tabId,
          });
          return { ok: true, tab };
        }),
    });
  }
}

export const tabRouterImplementation = TabRouterImpl.createRouter();

