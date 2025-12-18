export {};

declare global {
  type TeatimeViewBounds = { x: number; y: number; width: number; height: number };

  interface Window {
    teatimeElectron?: {
      /** Electron runtime 设备标识（启动时生成并持久化） */
      electronClientId?: string;
      /** 获取 Electron runtime 设备标识（异步兜底） */
      getElectronClientId?: () => Promise<string>;
      openBrowserWindow: (url: string) => Promise<{ id: number }>;
      upsertWebContentsView: (args: {
        key: string;
        url: string;
        bounds: TeatimeViewBounds;
        visible?: boolean;
      }) => Promise<{ ok: true }>;
      destroyWebContentsView: (key: string) => Promise<{ ok: true }>;
    };
  }
}
