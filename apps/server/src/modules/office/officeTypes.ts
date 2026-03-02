/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export const OFFICE_APP_TYPES = ["docx", "excel", "ppt"] as const;
export type OfficeAppType = (typeof OFFICE_APP_TYPES)[number];

export const OFFICE_ACTIONS = [
  "open",
  "readText",
  "replaceText",
  "insertAtCursor",
  "getDocumentInfo",
  "getSelectedText",
  "insertText",
  "deleteText",
  "findReplace",
  "formatText",
  "addTable",
  "readTable",
  "addComment",
  "getComments",
  "addBookmark",
  "save",
  "saveAs",
  "exportPdf",
  "getDocumentStructure",
  "insertImage",
] as const;
export type OfficeAction = (typeof OFFICE_ACTIONS)[number];

export type OfficeCommandPayload = {
  filePath?: string;
  text?: string;
  searchText?: string;
  replaceWith?: string;
  matchCase?: boolean;
  matchWholeWord?: boolean;
  position?: "start" | "end" | "cursor" | "bookmark" | "afterParagraph";
  bookmarkName?: string;
  paragraphIndex?: number;
  formatting?: {
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    fontName?: string;
    fontColor?: string;
  };
  tableRows?: number;
  tableCols?: number;
  tableIndex?: number;
  commentText?: string;
  imageUrl?: string;
  pdfPath?: string;
};

export type OfficeCommandContext = {
  workspaceId?: string;
  projectId?: string;
  requestedAt: string;
};

export type OfficeCommand = {
  commandId: string;
  clientId: string;
  appType: OfficeAppType;
  action: OfficeAction;
  payload: OfficeCommandPayload;
  context: OfficeCommandContext;
  timeoutSec?: number;
};

export type OfficeCommandAckStatus = "success" | "failed" | "timeout";

export type OfficeCommandAck = {
  commandId: string;
  clientId: string;
  status: OfficeCommandAckStatus;
  output?: {
    text?: string;
    docName?: string;
    docInfo?: {
      name: string;
      path: string;
      saved: boolean;
      readOnly: boolean;
    };
    selectedText?: string;
    comments?: Array<{ author: string; text: string; date: string }>;
    tableData?: string[][];
    structure?: Array<{ level: number; text: string; index: number }>;
    replacedCount?: number;
    success?: boolean;
  };
  errorText?: string | null;
  requestedAt: string;
};

export type OfficeClient = {
  clientId: string;
  appType: OfficeAppType;
  workspaceId?: string;
  projectId?: string;
  capabilities: OfficeAction[];
  clientMeta?: Record<string, unknown>;
  lastHeartbeat: number;
};
