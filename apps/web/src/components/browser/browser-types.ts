export type BrowserTab = {
  id: string;
  url: string;
  title?: string;
  viewKey: string;
  cdpTargetIds?: string[];
};

export type TeatimeWebContentsViewStatus = {
  key: string;
  webContentsId: number;
  url?: string;
  title?: string;
  loading?: boolean;
  ready?: boolean;
  failed?: { errorCode: number; errorDescription: string; validatedURL: string };
  destroyed?: boolean;
  ts: number;
};
