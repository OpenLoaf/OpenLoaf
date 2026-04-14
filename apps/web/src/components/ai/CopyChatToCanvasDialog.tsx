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

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@openloaf/ui/button";
import { Label } from "@openloaf/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { useProjects } from "@/hooks/use-projects";
import { useProjectStorageRootUri, useTempStorageRootUri } from "@/hooks/use-project-storage-root-uri";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { buildBoardFolderUri, buildFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { queuePendingBoardElements } from "@/components/board/engine/pending-elements-store";
import { buildImportedChatBoardElements } from "@/components/board/utils/imported-chat-board";
import { invalidateChatSessions } from "@/hooks/use-chat-sessions";
import { trpc } from "@/utils/trpc";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";

type CopyChatToCanvasDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSessionId: string;
};

type TargetMode = "new" | "existing";

/** Build a projectId -> rootUri map from the cached tree. */
function buildProjectRootUriMap(projects?: ProjectNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (items?: ProjectNode[]) => {
    items?.forEach((item) => {
      if (item.projectId) {
        map.set(item.projectId, item.rootUri);
      }
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(projects);
  return map;
}

/** Normalize optional string ids. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function CopyChatToCanvasDialog({
  open,
  onOpenChange,
  sourceSessionId,
}: CopyChatToCanvasDialogProps) {
  const { t } = useTranslation("ai");
  const { t: tNav } = useTranslation("nav");
  const queryClient = useQueryClient();
  const { openBoard } = useSidebarNavigation();
  const { data: projects } = useProjects();
  const projectRootUriMap = useMemo(() => buildProjectRootUriMap(projects), [projects]);
  const projectStorageRootUri = useProjectStorageRootUri();
  const tempStorageRootUri = useTempStorageRootUri();
  const [targetMode, setTargetMode] = useState<TargetMode>("new");
  const [selectedBoardId, setSelectedBoardId] = useState("");

  const sessionQuery = useQuery({
    ...trpc.chat.getSession.queryOptions({ sessionId: sourceSessionId }),
    enabled: open && Boolean(sourceSessionId),
  });
  const boardsQuery = useQuery({
    ...trpc.board.list.queryOptions({}),
    enabled: open,
  });

  const sourceProjectId = normalizeOptionalId(sessionQuery.data?.projectId);
  const availableBoards = useMemo(() => {
    const boards = boardsQuery.data ?? [];
    return boards.filter((board) => {
      if (sourceProjectId) {
        return board.projectId === sourceProjectId;
      }
      return board.projectId == null;
    });
  }, [boardsQuery.data, sourceProjectId]);
  const effectiveTargetMode: TargetMode =
    open && availableBoards.length > 0 ? targetMode : "new";
  const effectiveSelectedBoardId = useMemo(() => {
    if (!open || availableBoards.length === 0) return "";
    if (selectedBoardId && availableBoards.some((board) => board.id === selectedBoardId)) {
      return selectedBoardId;
    }
    return availableBoards[0]?.id ?? "";
  }, [availableBoards, open, selectedBoardId]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTargetMode("new");
      setSelectedBoardId("");
    }
    onOpenChange(nextOpen);
  };

  /** Resolve the correct root uri for the target board scope. */
  const resolveBoardRootUri = (projectId?: string | null) => {
    const normalizedProjectId = normalizeOptionalId(projectId);
    if (normalizedProjectId) {
      return projectRootUriMap.get(normalizedProjectId);
    }
    return tempStorageRootUri ?? projectStorageRootUri;
  };

  const copyMutation = useMutation(trpc.chat.copySessionToBoard.mutationOptions());

  const handleSubmit = async () => {
    let result: Awaited<ReturnType<typeof copyMutation.mutateAsync>>;
    try {
      if (!sourceSessionId) {
        toast.error(t("copyToCanvas.sessionMissing"));
        throw new Error("session missing");
      }
      if (effectiveTargetMode === "existing" && !effectiveSelectedBoardId) {
        toast.error(t("copyToCanvas.targetRequired"));
        throw new Error("target required");
      }
      result = await copyMutation.mutateAsync({
        sourceSessionId,
        ...(effectiveTargetMode === "existing"
          ? { targetBoardId: effectiveSelectedBoardId }
          : {}),
      });
    } catch (error) {
      const handled =
        error instanceof Error &&
        (error.message === "root missing" ||
          error.message === "session missing" ||
          error.message === "target required");
      if (!handled) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("copyToCanvas.failed"),
        );
      }
      throw error;
    }

    const rootUri = resolveBoardRootUri(result.board.projectId);
    if (!rootUri) {
      toast.error(t("copyToCanvas.rootMissing"));
      throw new Error("root missing");
    }

    const boardFolderUri = buildBoardFolderUri(rootUri, result.board.folderUri);

    try {
      const importedElements = await buildImportedChatBoardElements({
        messages: result.importedMessages,
        projectId: result.board.projectId ?? undefined,
      });
      queuePendingBoardElements(boardFolderUri, {
        elements: importedElements,
        mode: result.createdBoard ? "replace-if-empty" : "append",
        fitView: true,
      });
    } catch (error) {
      console.error("[copy-chat-to-canvas] build imported elements failed", error);
    }

    queryClient.invalidateQueries({ queryKey: trpc.board.list.queryKey() });
    invalidateChatSessions(queryClient);

    openBoard({
      boardId: result.board.id,
      title: result.board.title || sessionQuery.data?.title || tNav("canvasList.untitled"),
      folderUri: result.board.folderUri,
      rootUri,
      projectId: result.board.projectId,
    });

    setTargetMode("new");
    setSelectedBoardId("");
    toast.success(
      effectiveTargetMode === "existing"
        ? t("copyToCanvas.successExisting")
        : t("copyToCanvas.successNew"),
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      title={t("copyToCanvas.title")}
      description={t("copyToCanvas.description")}
      confirmLabel={t("copyToCanvas.confirm")}
      cancelLabel={t("copyToCanvas.cancel")}
      loadingLabel={t("copyToCanvas.submitting")}
      disabled={sessionQuery.isLoading || (targetMode === "existing" && !selectedBoardId)}
      onConfirm={handleSubmit}
    >
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>{t("copyToCanvas.targetMode")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={effectiveTargetMode === "new" ? "default" : "outline"}
              onClick={() => setTargetMode("new")}
            >
              {t("copyToCanvas.createNew")}
            </Button>
            <Button
              type="button"
              variant={effectiveTargetMode === "existing" ? "default" : "outline"}
              disabled={availableBoards.length === 0}
              onClick={() => setTargetMode("existing")}
            >
              {t("copyToCanvas.useExisting")}
            </Button>
          </div>
        </div>

        {effectiveTargetMode === "existing" ? (
          <div className="space-y-2">
            <Label htmlFor="copy-to-canvas-target">{t("copyToCanvas.targetBoard")}</Label>
            <Select value={effectiveSelectedBoardId} onValueChange={setSelectedBoardId}>
              <SelectTrigger id="copy-to-canvas-target">
                <SelectValue placeholder={t("copyToCanvas.targetPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {availableBoards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.title?.trim() || tNav("canvasList.untitled")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableBoards.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("copyToCanvas.emptyBoards")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
