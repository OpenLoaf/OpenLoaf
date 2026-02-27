/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

/** WebSocket path for board collaboration. */
export const BOARD_COLLAB_WS_PATH = "/board/ws";

/** Board collaboration query payload schema. */
export const boardCollabQuerySchema = z
  .object({
    /** Workspace id used for file resolution. */
    workspaceId: z.string().min(1),
    /** Project id used for file resolution. */
    projectId: z.string().optional(),
    /** Board file uri for persistence. */
    boardFileUri: z.string().optional(),
    /** Board folder uri for persistence. */
    boardFolderUri: z.string().optional(),
    /** Collaboration document id. */
    docId: z.string().min(1),
  })
  .refine((data) => Boolean(data.boardFileUri || data.boardFolderUri), {
    message: "boardFileUri or boardFolderUri is required",
  });

export type BoardCollabQuery = z.infer<typeof boardCollabQuerySchema>;

export type BoardJsonNode = {
  /** Node id. */
  id: string;
  /** Node kind. */
  kind: "node";
  /** Node type identifier. */
  type: string;
  /** Node props payload. */
  props?: Record<string, unknown>;
};

export type BoardJsonConnector = {
  /** Connector id. */
  id: string;
  /** Connector kind. */
  kind: "connector";
  /** Connector type identifier. */
  type: string;
  /** Connector source endpoint. */
  source?: Record<string, unknown>;
  /** Connector target endpoint. */
  target?: Record<string, unknown>;
  /** Connector style identifier. */
  style?: string;
};

export type BoardJsonSnapshot = {
  /** Simplified nodes for debug snapshot. */
  nodes: BoardJsonNode[];
  /** Simplified connectors for debug snapshot. */
  connectors: BoardJsonConnector[];
};
