/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getProjectsQueryKey } from "@/hooks/use-projects";
import type { buildProjectHierarchyIndex } from "@/lib/project-tree";
import type { UseMutationResult } from "@tanstack/react-query";
import type { FileNode, DragInsertTarget, ProjectDropPosition } from "./projectTreeTypes";
import { applyProjectDragPreview, resolveProjectDropPosition } from "./projectTreeTypes";

export interface UseProjectTreeDragParams {
  moveProject: UseMutationResult<any, any, any, any>;
  projectHierarchy: ReturnType<typeof buildProjectHierarchyIndex>;
  expandedNodes: Record<string, boolean>;
  setExpanded: (uri: string, isExpanded: boolean) => void;
  isElectron: boolean;
  suppressNextClickRef: React.MutableRefObject<boolean>;
}

export function useProjectTreeDrag({
  moveProject,
  projectHierarchy,
  expandedNodes,
  setExpanded,
  isElectron,
  suppressNextClickRef,
}: UseProjectTreeDragParams) {
  const { t } = useTranslation(["nav", "common"]);
  const queryClient = useQueryClient();

  /** Track currently dragging project info. */
  const [draggingProject, setDraggingProject] = useState<{
    projectId: string;
    title: string;
  } | null>(null);
  /** Track drag-over project id. */
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  /** Track drag insert target for reorder. */
  const [dragInsertTarget, setDragInsertTarget] = useState<DragInsertTarget | null>(
    null,
  );
  /** Track root drop zone active state. */
  const [isRootDropActive, setIsRootDropActive] = useState(false);
  /** Track pending project move confirmation. */
  const [pendingMove, setPendingMove] = useState<{
    projectId: string;
    targetParentId: string | null;
    targetSiblingId?: string | null;
    targetPosition?: "before" | "after";
    mode: "reparent" | "reorder";
  } | null>(null);
  /** Track move request state. */
  const [isMoveBusy, setIsMoveBusy] = useState(false);
  /** Drag ghost overlay state for pointer drag. */
  const [dragGhost, setDragGhost] = useState<{
    projectId: string;
    title: string;
    icon?: string | null;
    x: number;
    y: number;
  } | null>(null);
  /** Drag ghost position cache for pointer drag updates. */
  const dragGhostPositionRef = useRef<{ x: number; y: number } | null>(null);
  /** Drag ghost animation frame handle. */
  const dragGhostRafRef = useRef<number | null>(null);
  /** Auto expand timer for drag hover. */
  const autoExpandRef = useRef<{ projectId: string; timer: number | null } | null>(
    null,
  );

  /** Clear drag ghost overlay state. */
  const clearDragGhost = () => {
    if (dragGhostRafRef.current !== null) {
      cancelAnimationFrame(dragGhostRafRef.current);
      dragGhostRafRef.current = null;
    }
    dragGhostPositionRef.current = null;
    setDragGhost(null);
  };

  /** Schedule drag ghost position update. */
  const scheduleDragGhostUpdate = (x: number, y: number) => {
    if (typeof window === "undefined") return;
    dragGhostPositionRef.current = { x, y };
    if (dragGhostRafRef.current !== null) return;
    dragGhostRafRef.current = window.requestAnimationFrame(() => {
      dragGhostRafRef.current = null;
      const next = dragGhostPositionRef.current;
      if (!next) return;
      setDragGhost((prev) => (prev ? { ...prev, x: next.x, y: next.y } : prev));
    });
  };

  /** Clear pending auto-expand timer. */
  const clearAutoExpand = () => {
    const current = autoExpandRef.current;
    if (current?.timer) {
      window.clearTimeout(current.timer);
    }
    autoExpandRef.current = null;
  };

  /** Schedule auto-expand for a collapsed project. */
  const scheduleAutoExpand = (projectId: string | null) => {
    if (typeof window === "undefined") return;
    if (!projectId) {
      clearAutoExpand();
      return;
    }
    if (autoExpandRef.current?.projectId === projectId) return;
    clearAutoExpand();
    const rootUri = projectHierarchy.rootUriById.get(projectId);
    if (!rootUri) return;
    const descendants = projectHierarchy.descendantsById.get(projectId);
    if (!descendants || descendants.size === 0) return;
    const nodeKey = `${projectId}:${rootUri}`;
    const isExpanded = expandedNodes[nodeKey] ?? false;
    if (isExpanded) return;
    // 逻辑：拖拽悬停 300ms 后自动展开，便于继续拖到子项目。
    const timer = window.setTimeout(() => {
      setExpanded(nodeKey, true);
      autoExpandRef.current = null;
    }, 300);
    autoExpandRef.current = { projectId, timer };
  };

  /** Reset drag state for project moves. */
  const resetProjectDragState = () => {
    setDraggingProject(null);
    setDragOverProjectId(null);
    setDragInsertTarget(null);
    setIsRootDropActive(false);
    clearAutoExpand();
    clearDragGhost();
  };

  /** Resolve project title from index with fallback. */
  const resolveProjectTitle = (projectId: string) =>
    projectHierarchy.projectById.get(projectId)?.title ?? t("common:untitledProject");

  /** Check whether a drop target is valid. */
  const canDropProject = (sourceId: string, targetParentId: string | null) => {
    if (!sourceId) return false;
    if (targetParentId === sourceId) return false;
    const descendants = projectHierarchy.descendantsById.get(sourceId);
    // 逻辑：禁止把项目拖到自身或后代节点。
    if (targetParentId && descendants?.has(targetParentId)) return false;
    return true;
  };

  /** Apply project move mutation and refresh data. */
  const applyProjectMove = async (payload: {
    projectId: string;
    targetParentId: string | null;
    targetSiblingId?: string | null;
    targetPosition?: "before" | "after";
    mode: "reparent" | "reorder";
  }) => {
    try {
      setIsMoveBusy(true);
      await moveProject.mutateAsync({
        projectId: payload.projectId,
        targetParentProjectId: payload.targetParentId ?? null,
        targetSiblingProjectId: payload.targetSiblingId ?? undefined,
        targetPosition: payload.targetPosition ?? undefined,
      });
      toast.success(t(payload.mode === "reorder" ? "nav:projectTree.reorderSuccess" : "nav:projectTree.moveSuccess"));
      setPendingMove(null);
      await queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? t("nav:projectTree.moveFailed"));
    } finally {
      setIsMoveBusy(false);
    }
  };

  /** Confirm project move after user approval. */
  const handleConfirmProjectMove = async () => {
    if (!pendingMove?.projectId) return;
    void applyProjectMove({
      projectId: pendingMove.projectId,
      targetParentId: pendingMove.targetParentId ?? null,
      targetSiblingId: pendingMove.targetSiblingId ?? undefined,
      targetPosition: pendingMove.targetPosition ?? undefined,
      mode: pendingMove.mode,
    });
  };

  /** Handle project drag start from tree. */
  const handleProjectDragStart = (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (node.kind !== "project" || !node.projectId) return;
    applyProjectDragPreview(event.currentTarget, event);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.projectId);
    setDraggingProject({ projectId: node.projectId, title: node.name });
  };

  /** Handle pointer-based drag for Electron. */
  const handleProjectPointerDown = (
    node: FileNode,
    event: React.PointerEvent<HTMLElement>
  ) => {
    if (!isElectron) return;
    if (event.button !== 0) return;
    if (node.kind !== "project" || !node.projectId) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const sourceProject = {
      projectId: node.projectId,
      title: node.name,
      icon: node.projectIcon ?? null,
    };
    let hasStartedDrag = false;
    let lastDropTarget: { projectId: string; position: ProjectDropPosition } | null =
      null;
    let lastRootDropActive = false;

    const updateDropTarget = (moveEvent: PointerEvent) => {
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const rootTarget = target?.closest?.("[data-project-root-drop=\"true\"]");
      const projectTarget = target?.closest?.("[data-project-id]") as HTMLElement | null;
      const targetProjectId = projectTarget?.getAttribute("data-project-id") ?? null;
      if (rootTarget) {
        setIsRootDropActive(true);
        setDragOverProjectId(null);
        setDragInsertTarget(null);
        lastRootDropActive = true;
        lastDropTarget = null;
        return;
      }
      setIsRootDropActive(false);
      lastRootDropActive = false;
      if (
        targetProjectId &&
        projectTarget &&
        targetProjectId !== sourceProject.projectId
      ) {
        const dropPosition = resolveProjectDropPosition(
          projectTarget,
          moveEvent.clientY
        );
        const targetParentId =
          dropPosition === "inside"
            ? targetProjectId
            : projectHierarchy.parentById.get(targetProjectId) ?? null;
        if (canDropProject(sourceProject.projectId, targetParentId)) {
          if (dropPosition === "inside") {
            setDragOverProjectId(targetProjectId);
            setDragInsertTarget(null);
            scheduleAutoExpand(targetProjectId);
          } else {
            setDragOverProjectId(null);
            setDragInsertTarget({
              projectId: targetProjectId,
              position: dropPosition === "before" ? "before" : "after",
            });
            scheduleAutoExpand(null);
          }
          lastDropTarget = { projectId: targetProjectId, position: dropPosition };
          return;
        }
      }
      setDragOverProjectId(null);
      setDragInsertTarget(null);
      lastDropTarget = null;
      scheduleAutoExpand(null);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (!hasStartedDrag) {
        if (Math.hypot(deltaX, deltaY) < 4) return;
        // 逻辑：鼠标位移超过阈值后才进入拖拽态，避免误触打开项目。
        hasStartedDrag = true;
        suppressNextClickRef.current = true;
        setDraggingProject(sourceProject);
        setDragGhost({
          projectId: sourceProject.projectId,
          title: sourceProject.title,
          icon: sourceProject.icon,
          x: startX + 12,
          y: startY + 12,
        });
      }
      if (!hasStartedDrag) return;
      moveEvent.preventDefault();
      // 逻辑：拖拽影像略微偏移，避免遮挡指针。
      scheduleDragGhostUpdate(moveEvent.clientX + 12, moveEvent.clientY + 12);
      updateDropTarget(moveEvent);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (!hasStartedDrag) return;
      if (lastRootDropActive) {
        const currentParentId =
          projectHierarchy.parentById.get(sourceProject.projectId) ?? null;
        if (currentParentId) {
          setPendingMove({
            projectId: sourceProject.projectId,
            targetParentId: null,
            mode: "reparent",
          });
        }
      } else if (lastDropTarget) {
        const currentParentId =
          projectHierarchy.parentById.get(sourceProject.projectId) ?? null;
        if (lastDropTarget.position === "inside") {
          if (
            canDropProject(sourceProject.projectId, lastDropTarget.projectId) &&
            currentParentId !== lastDropTarget.projectId
          ) {
            setPendingMove({
              projectId: sourceProject.projectId,
              targetParentId: lastDropTarget.projectId,
              mode: "reparent",
            });
          }
        } else {
          const targetParentId =
            projectHierarchy.parentById.get(lastDropTarget.projectId) ?? null;
          if (canDropProject(sourceProject.projectId, targetParentId)) {
            // 逻辑：调整顺序无需确认，直接提交变更。
            void applyProjectMove({
              projectId: sourceProject.projectId,
              targetParentId,
              targetSiblingId: lastDropTarget.projectId,
              targetPosition:
                lastDropTarget.position === "before" ? "before" : "after",
              mode: "reorder",
            });
          }
        }
      }
      resetProjectDragState();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  /** Handle drag over a project node. */
  const handleProjectDragOver = (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (!draggingProject || node.kind !== "project" || !node.projectId) return;
    if (node.projectId === draggingProject.projectId) return;
    const dropPosition = resolveProjectDropPosition(
      event.currentTarget,
      event.clientY
    );
    const targetParentId =
      dropPosition === "inside"
        ? node.projectId
        : projectHierarchy.parentById.get(node.projectId) ?? null;
    if (!canDropProject(draggingProject.projectId, targetParentId)) {
      setDragOverProjectId(null);
      setDragInsertTarget(null);
      scheduleAutoExpand(null);
      return;
    }
    event.preventDefault();
    if (dropPosition === "inside") {
      setDragOverProjectId(node.projectId);
      setDragInsertTarget(null);
      scheduleAutoExpand(node.projectId);
    } else {
      setDragOverProjectId(null);
      setDragInsertTarget({
        projectId: node.projectId,
        position: dropPosition === "before" ? "before" : "after",
      });
      scheduleAutoExpand(null);
    }
    setIsRootDropActive(false);
  };

  /** Handle drag leave a project node. */
  const handleProjectDragLeave = (
    node: FileNode,
    _event: React.DragEvent<HTMLElement>
  ) => {
    if (dragOverProjectId && node.projectId === dragOverProjectId) {
      setDragOverProjectId(null);
    }
    if (dragInsertTarget?.projectId === node.projectId) {
      setDragInsertTarget(null);
    }
    scheduleAutoExpand(null);
  };

  /** Handle dropping a project onto another project node. */
  const handleProjectDrop = (
    node: FileNode,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (!draggingProject || node.kind !== "project" || !node.projectId) return;
    if (node.projectId === draggingProject.projectId) return;
    const dropPosition = resolveProjectDropPosition(
      event.currentTarget,
      event.clientY
    );
    const targetParentId =
      dropPosition === "inside"
        ? node.projectId
        : projectHierarchy.parentById.get(node.projectId) ?? null;
    if (!canDropProject(draggingProject.projectId, targetParentId)) return;
    event.preventDefault();
    const currentParentId =
      projectHierarchy.parentById.get(draggingProject.projectId) ?? null;
    if (dropPosition === "inside") {
      // 逻辑：拖到同一父节点时不触发确认。
      if (currentParentId === node.projectId) {
        resetProjectDragState();
        return;
      }
      setPendingMove({
        projectId: draggingProject.projectId,
        targetParentId: node.projectId,
        mode: "reparent",
      });
    } else {
      // 逻辑：调整顺序无需确认，直接提交变更。
      void applyProjectMove({
        projectId: draggingProject.projectId,
        targetParentId,
        targetSiblingId: node.projectId,
        targetPosition: dropPosition === "before" ? "before" : "after",
        mode: "reorder",
      });
    }
    resetProjectDragState();
  };

  /** Handle drag end cleanup. */
  const handleProjectDragEnd = () => {
    resetProjectDragState();
  };

  /** Handle drag over root drop zone. */
  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingProject) return;
    if (!canDropProject(draggingProject.projectId, null)) return;
    event.preventDefault();
    setIsRootDropActive(true);
    setDragOverProjectId(null);
    setDragInsertTarget(null);
    scheduleAutoExpand(null);
  };

  /** Handle drag leave root drop zone. */
  const handleRootDragLeave = () => {
    setIsRootDropActive(false);
    setDragInsertTarget(null);
    scheduleAutoExpand(null);
  };

  /** Handle dropping a project onto root drop zone. */
  const handleRootDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingProject) return;
    if (!canDropProject(draggingProject.projectId, null)) return;
    event.preventDefault();
    const currentParentId =
      projectHierarchy.parentById.get(draggingProject.projectId) ?? null;
    // 逻辑：已经是根项目则不触发确认。
    if (!currentParentId) {
      resetProjectDragState();
      return;
    }
    setPendingMove({
      projectId: draggingProject.projectId,
      targetParentId: null,
      mode: "reparent",
    });
    resetProjectDragState();
  };

  return {
    draggingProject,
    dragOverProjectId,
    dragInsertTarget,
    isRootDropActive,
    pendingMove,
    setPendingMove,
    isMoveBusy,
    dragGhost,
    handleProjectDragStart,
    handleProjectPointerDown,
    handleProjectDragOver,
    handleProjectDragLeave,
    handleProjectDrop,
    handleProjectDragEnd,
    handleRootDragOver,
    handleRootDragLeave,
    handleRootDrop,
    handleConfirmProjectMove,
    resetProjectDragState,
    resolveProjectTitle,
  };
}
