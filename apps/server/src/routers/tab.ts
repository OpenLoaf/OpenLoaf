/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { BaseTabRouter, tabSchemas, t, shieldedProcedure } from "@openloaf/api";
import { tabSnapshotStore } from "@/modules/tab/TabSnapshotStoreAdapter";

export class TabRouterImpl extends BaseTabRouter {
  /** Tab snapshot read/write (server-side TTL cache, MVP). */
  public static createRouter() {
    return t.router({
      upsertSnapshot: shieldedProcedure
        .input(tabSchemas.upsertSnapshot.input)
        .output(tabSchemas.upsertSnapshot.output)
        .mutation(async ({ input }) => {
          // 只写入 TabSnapshotStore，作为 server 侧唯一 tab 快照来源。
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
