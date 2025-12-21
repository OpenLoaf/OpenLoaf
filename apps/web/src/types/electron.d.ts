export {};

declare global {
  type TeatimeViewBounds = { x: number; y: number; width: number; height: number };

  interface Window {
    teatimeElectron?: {
      openBrowserWindow: (url: string) => Promise<{ id: number }>;
      ensureWebContentsView?: (args: {
        key: string;
        url: string;
      }) => Promise<
        { ok: true; webContentsId: number; cdpTargetId?: string } | { ok: false }
      >;
      runBrowserCommand?: (args: {
        /** 与 server 的一次 tool call 对应，用于回传结果。 */
        commandId: string;
        /** 当前应用 tabId（用于定位“用户正在看的浏览器面板”）。 */
        tabId: string;
        /** WebContentsView 的业务 key（由 open-url 生成并写入 browserTabs）。 */
        viewKey: string;
        /** CDP targetId（可选；Electron 可自行解析/兜底）。 */
        cdpTargetId?: string;
        command: {
          kind: "snapshot" | "act" | "observe" | "extract" | "wait";
          input?: Record<string, unknown>;
        };
      }) => Promise<unknown>;
      upsertWebContentsView: (args: {
        key: string;
        url: string;
        bounds: TeatimeViewBounds;
        visible?: boolean;
      }) => Promise<{ ok: true }>;
      destroyWebContentsView: (key: string) => Promise<{ ok: true }>;
      getWebContentsViewCount?: () => Promise<{ ok: true; count: number } | { ok: false }>;
    };
  }
}
