export type { BrowserTab } from "@tenas-ai/api/common";

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
  requestCount?: number;
  finishedCount?: number;
  failedCount?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  destroyed?: boolean;
  ts: number;
};

export type TenasWebContentsViewWindowOpen = {
  key: string;
  url: string;
  disposition?: string;
  frameName?: string;
};
