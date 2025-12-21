export {};

declare global {
  type TeatimeViewBounds = { x: number; y: number; width: number; height: number };

  interface Window {
    teatimeElectron?: {
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
