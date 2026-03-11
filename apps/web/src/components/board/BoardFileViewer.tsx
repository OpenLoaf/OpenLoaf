/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BoardCanvas } from "./core/BoardCanvas";
import { BOARD_NODE_DEFINITIONS } from "./core/board-nodes";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { trpc } from "@/utils/trpc";

export interface BoardFileViewerProps {
  /** Target board folder uri. */
  boardFolderUri?: string;
  /** Target board file uri. */
  boardFileUri?: string;
  /** Optional display name. */
  name?: string;
  /** Current project id. */
  projectId?: string;
  /** Project root uri for resolving attachments. */
  rootUri?: string;
  /** Panel key used for header actions. */
  panelKey?: string;
  /** Current tab id for stack visibility. */
  tabId?: string;
}

/** Render a board canvas backed by a board folder. */
const BoardFileViewer = memo(function BoardFileViewer({
  boardFolderUri,
  boardFileUri,
  projectId,
  rootUri,
  panelKey,
  tabId,
}: BoardFileViewerProps) {
  const { t } = useTranslation("common");
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const runtimeStack = useTabRuntime((state) =>
    tabId ? state.runtimeByTabId[tabId]?.stack : undefined,
  );
  const runtimeActiveStackId = useTabRuntime((state) =>
    tabId ? state.runtimeByTabId[tabId]?.activeStackItemId : undefined,
  );
  const stackHidden = useTabRuntime((state) =>
    tabId ? Boolean(state.runtimeByTabId[tabId]?.stackHidden) : false,
  );
  const stack = Array.isArray(runtimeStack) ? runtimeStack : [];
  const isStackItem = Boolean(panelKey && stack.some((item) => item.id === panelKey));
  const activeStackId =
    typeof runtimeActiveStackId === "string"
      ? runtimeActiveStackId || stack.at(-1)?.id || ""
      : stack.at(-1)?.id || "";
  const uiHidden = stackHidden && isStackItem && activeStackId === panelKey;
  const resolvedWorkspaceId = workspaceCompatQuery.data?.id;

  if (!resolvedWorkspaceId) {
    return <div className="h-full w-full p-4 text-muted-foreground">{t("file.workspaceLoading")}</div>;
  }

  if (!boardFolderUri || !boardFileUri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择画布</div>;
  }

  return (
    <div className="h-full w-full bg-background">
      <BoardCanvas
        className="h-full w-full"
        workspaceId={resolvedWorkspaceId}
        boardId={boardFolderUri}
        boardFolderUri={boardFolderUri}
        boardFileUri={boardFileUri}
        projectId={projectId}
        rootUri={rootUri}
        tabId={tabId}
        panelKey={panelKey}
        uiHidden={uiHidden}
        nodes={BOARD_NODE_DEFINITIONS}
      />
    </div>
  );
});

export default BoardFileViewer;
