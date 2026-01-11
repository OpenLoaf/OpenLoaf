export type BrowserTab = {
  id: string;
  url: string;
  title?: string;
  viewKey: string;
  cdpTargetIds?: string[];
};

export type TenasWebContentsViewStatus = {
  key: string;
  webContentsId: number;
  url?: string;
  title?: string;
  faviconUrl?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loading?: boolean;
  ready?: boolean;
  failed?: { errorCode: number; errorDescription: string; validatedURL: string };
  destroyed?: boolean;
  ts: number;
};

export type TenasWebContentsViewWindowOpen = {
  key: string;
  url: string;
  disposition?: string;
  frameName?: string;
};
