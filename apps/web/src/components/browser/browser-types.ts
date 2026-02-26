/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nexport type { BrowserTab } from "@openloaf/api/common";

export type OpenLoafWebContentsViewStatus = {
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

export type OpenLoafWebContentsViewWindowOpen = {
  key: string;
  url: string;
  disposition?: string;
  frameName?: string;
};
