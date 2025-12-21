import { BaseTabRouter, tabSchemas, t, shieldedProcedure } from "@teatime-ai/api";
import { chatContextStore } from "@/modules/chat/ChatContextAdapter";
import { resolveBrowserCommandPending } from "@/modules/tab/BrowserCommandStoreAdapter";

export class TabRouterImpl extends BaseTabRouter {
  /** Tab snapshot read/write (server-side TTL cache, MVP). */
  public static createRouter() {
    return t.router({
      upsertSnapshot: shieldedProcedure
        .input(tabSchemas.upsertSnapshot.input)
        .output(tabSchemas.upsertSnapshot.output)
        .mutation(async ({ input }) => {
          await chatContextStore.upsertTabSnapshot({
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
          const tab = await chatContextStore.getTabSnapshot({
            sessionId: input.sessionId,
            clientId: input.clientId,
            tabId: input.tabId,
          });
          return { ok: true, tab };
        }),

      reportBrowserCommandResult: shieldedProcedure
        .input(tabSchemas.reportBrowserCommandResult.input)
        .output(tabSchemas.reportBrowserCommandResult.output)
        .mutation(async ({ input }) => {
          // 中文注释：浏览器命令的执行发生在 Electron（用户可见 WebContentsView），server 只负责把结果回传给工具等待方。
          await resolveBrowserCommandPending({ commandId: input.commandId, result: input.result });
          return { ok: true };
        }),
    });
  }
}

export const tabRouterImplementation = TabRouterImpl.createRouter();
