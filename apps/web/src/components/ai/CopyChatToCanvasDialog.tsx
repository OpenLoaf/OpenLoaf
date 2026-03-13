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

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
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
import { useProjectStorageRootUri } from "@/hooks/use-project-storage-root-uri";
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

  useEffect(() => {
    if (!open) {
      setTargetMode("new");
      setSelectedBoardId("");
      return;
    }
    if (availableBoards.length === 0) {
      setTargetMode("new");
      setSelectedBoardId("");
      return;
    }
    setSelectedBoardId((current) =>
      current && availableBoards.some((board) => board.id === current)
        ? current
        : availableBoards[0]?.id ?? "",
    );
  }, [availableBoards, open]);

  /** Resolve the correct root uri for the target board scope. */
  const resolveBoardRootUri = (projectId?: string | null) => {
    const normalizedProjectId = normalizeOptionalId(projectId);
    if (normalizedProjectId) {
      return projectRootUriMap.get(normalizedProjectId);
    }
    return projectStorageRootUri;
  };

  const copyMutation = useMutation(trpc.chat.copySessionToBoard.mutationOptions());

  const handleSubmit = async () => {
    if (!sourceSessionId) {
      toast.error(t("copyToCanvas.sessionMissing"));
      return;
    }
    if (targetMode === "existing" && !selectedBoardId) {
      toast.error(t("copyToCanvas.targetRequired"));
      return;
    }

    try {
      const result = await copyMutation.mutateAsync({
        sourceSessionId,
        ...(targetMode === "existing" ? { targetBoardId: selectedBoardId } : {}),
      });

      const rootUri = resolveBoardRootUri(result.board.projectId);
      if (!rootUri) {
        toast.error(t("copyToCanvas.rootMissing"));
        return;
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

      onOpenChange(false);
      toast.success(
        targetMode === "existing"
          ? t("copyToCanvas.successExisting")
          : t("copyToCanvas.successNew"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("copyToCanvas.failed"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("copyToCanvas.title")}</DialogTitle>
          <DialogDescription>{t("copyToCanvas.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("copyToCanvas.targetMode")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={targetMode === "new" ? "default" : "outline"}
                onClick={() => setTargetMode("new")}
              >
                {t("copyToCanvas.createNew")}
              </Button>
              <Button
                type="button"
                variant={targetMode === "existing" ? "default" : "outline"}
                disabled={availableBoards.length === 0}
                onClick={() => setTargetMode("existing")}
              >
                {t("copyToCanvas.useExisting")}
              </Button>
            </div>
          </div>

          {targetMode === "existing" ? (
            <div className="space-y-2">
              <Label htmlFor="copy-to-canvas-target">{t("copyToCanvas.targetBoard")}</Label>
              <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
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

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={copyMutation.isPending}
          >
            {t("copyToCanvas.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              copyMutation.isPending
              || sessionQuery.isLoading
              || (targetMode === "existing" && !selectedBoardId)
            }
          >
            {copyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("copyToCanvas.submitting")}
              </>
            ) : (
              t("copyToCanvas.confirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
