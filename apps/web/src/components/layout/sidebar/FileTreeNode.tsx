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

import { skipToken, useQuery } from "@tanstack/react-query";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSubButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@openloaf/ui/sidebar";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@openloaf/ui/context-menu";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import {
  ChevronRight,
  FileText,
} from "lucide-react";
import { trpc as trpcContext } from "@/utils/trpc";
import {
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import { cn } from "@/lib/utils";
import { SidebarHoverPanel } from "@/components/layout/sidebar/SidebarHoverPanel";
import type { FileTreeNodeProps } from "./projectTreeTypes";
import { getNodeKey } from "./projectTreeTypes";

/** Render a file tree node recursively. */
export function FileTreeNode({
  node,
  depth,
  activeUri,
  activeProjectRootUri,
  expandedNodes,
  setExpanded,
  onPrimaryClick,
  renderContextMenuContent,
  contextSelectedUri,
  onContextMenuOpenChange,
  subItemGapClassName,
  dragOverProjectId,
  dragInsertTarget,
  draggingProjectId,
  disableNativeDrag,
  onProjectDragStart,
  onProjectDragOver,
  onProjectDragLeave,
  onProjectDrop,
  onProjectDragEnd,
  onProjectPointerDown,
  onNativeContextMenu,
  enableHoverPanel,
}: FileTreeNodeProps) {
  const trpc = trpcContext;
  const nodeKey = getNodeKey(node);
  const isExpanded = expandedNodes[nodeKey] ?? false;
  const isActive =
    activeUri === node.uri ||
    contextSelectedUri === nodeKey ||
    (node.kind === "project" && activeProjectRootUri === node.uri);
  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      node.kind === "folder" && isExpanded
        ? { projectId: node.projectId, uri: node.uri }
        : skipToken
    )
  );
  const fileChildren = listQuery.data?.entries ?? [];
  const normalizedFileChildren = fileChildren.map((child) => {
    if (child.kind === "folder" && isBoardFolderName(child.name)) {
      return { ...child, kind: "file", ext: undefined, projectId: node.projectId };
    }
    return { ...child, projectId: node.projectId };
  });
  const projectChildren = node.kind === "project" ? node.children ?? [] : [];
  const children = node.kind === "project" ? projectChildren : normalizedFileChildren;
  const hasChildren = node.kind === "project" ? children.length > 0 : true;
  const isProjectNode = node.kind === "project" && Boolean(node.projectId);
  const isDraggable = isProjectNode && Boolean(onProjectDragStart) && !disableNativeDrag;
  const isDragOver =
    isProjectNode && dragOverProjectId && node.projectId === dragOverProjectId;
  const isDraggingSelf =
    isProjectNode && draggingProjectId && node.projectId === draggingProjectId;
  const insertPosition =
    isProjectNode && dragInsertTarget && dragInsertTarget.projectId === node.projectId
      ? dragInsertTarget.position
      : null;

  const Item = depth === 0 ? SidebarMenuItem : SidebarMenuSubItem;
  const Button = depth === 0 ? SidebarMenuButton : SidebarMenuSubButton;

  if (node.kind === "file") {
    const displayName = isBoardFolderName(node.name)
      ? getBoardDisplayName(node.name)
      : getDisplayFileName(node.name, node.ext);
    return (
      <Item key={nodeKey}>
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              tooltip={displayName}
              isActive={isActive}
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => onPrimaryClick(node)}
              onContextMenu={onNativeContextMenu}
            >
              <FileText className="h-4 w-4" />
              <span>{displayName}</span>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
      </Item>
    );
  }

  const collapsibleContent = (
    <CollapsiblePrimitive.Root
      key={nodeKey}
      asChild
      open={isExpanded}
      onOpenChange={(open) => setExpanded(nodeKey, open)}
      className="group/collapsible"
    >
      <Item>
        {insertPosition ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-2 right-2 h-0.5 rounded-full bg-primary",
              insertPosition === "before" ? "top-0" : "bottom-0"
            )}
          />
        ) : null}
        <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
          <ContextMenuTrigger asChild>
            <Button
              asChild
              tooltip={node.name}
              isActive={isActive}
              className={cn(
                "overflow-visible text-sidebar-foreground/80 [&>svg]:text-muted-foreground",
                isDragOver && "ring-1 ring-ring/60 bg-sidebar-accent/70",
                isDraggingSelf && "opacity-60",
              )}
            >
              <div
                role="button"
                tabIndex={0}
                data-project-id={node.projectId ?? undefined}
                onClick={() => onPrimaryClick(node)}
                onContextMenu={onNativeContextMenu}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPrimaryClick(node);
                  }
                }}
                onPointerDown={(event) => onProjectPointerDown?.(node, event)}
                draggable={isDraggable}
                onDragStart={
                  isDraggable ? (event) => onProjectDragStart?.(node, event) : undefined
                }
                onDragOver={
                  isDraggable ? (event) => onProjectDragOver?.(node, event) : undefined
                }
                onDragLeave={
                  isDraggable ? (event) => onProjectDragLeave?.(node, event) : undefined
                }
                onDrop={isDraggable ? (event) => onProjectDrop?.(node, event) : undefined}
                onDragEnd={
                  isDraggable ? (event) => onProjectDragEnd?.(node, event) : undefined
                }
              >
                {node.projectIcon ? (
                  <span className="text-xs leading-none">{node.projectIcon}</span>
                ) : (
                  <img src="/head_s.png" alt="" className="h-4 w-4 rounded-3xl" />
                )}
                <span>{node.name}</span>
              </div>
            </Button>
          </ContextMenuTrigger>
          {renderContextMenuContent(node)}
        </ContextMenu>
        {hasChildren ? (
          <CollapsiblePrimitive.Trigger asChild>
            <SidebarMenuAction
              aria-label="Toggle"
              className="text-muted-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <ChevronRight className="transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuAction>
          </CollapsiblePrimitive.Trigger>
        ) : null}
        {children.length > 0 ? (
          <CollapsiblePrimitive.Content className="data-[state=closed]:overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down data-[state=open]:overflow-visible">
            <SidebarMenuSub className={cn("mx-1 px-1", subItemGapClassName)}>
              {children.map((child: any) => (
                <FileTreeNode
                  key={getNodeKey(child)}
                  node={{
                    uri: child.uri,
                    name: child.name,
                    kind: child.kind,
                    ext: child.ext,
                    children: child.children,
                    projectId: child.projectId,
                    projectIcon: child.projectIcon,
                    isFavorite: child.isFavorite,
                  }}
                  depth={depth + 1}
                  activeUri={activeUri}
                  activeProjectRootUri={activeProjectRootUri}
                  expandedNodes={expandedNodes}
                  setExpanded={setExpanded}
                  onPrimaryClick={onPrimaryClick}
                  renderContextMenuContent={renderContextMenuContent}
                  contextSelectedUri={contextSelectedUri}
                  onContextMenuOpenChange={onContextMenuOpenChange}
                  subItemGapClassName={subItemGapClassName}
                  dragOverProjectId={dragOverProjectId}
                  dragInsertTarget={dragInsertTarget}
                  draggingProjectId={draggingProjectId}
                  onProjectDragStart={onProjectDragStart}
                  onProjectDragOver={onProjectDragOver}
                  onProjectDragLeave={onProjectDragLeave}
                  onProjectDrop={onProjectDrop}
                  onProjectDragEnd={onProjectDragEnd}
                  onProjectPointerDown={onProjectPointerDown}
                  onNativeContextMenu={onNativeContextMenu}
                  enableHoverPanel={enableHoverPanel}
                />
              ))}
            </SidebarMenuSub>
          </CollapsiblePrimitive.Content>
        ) : null}
      </Item>
    </CollapsiblePrimitive.Root>
  );

  if (enableHoverPanel && isProjectNode && node.projectId) {
    return (
      <SidebarHoverPanel
        type="project-chats"
        projectId={node.projectId}
      >
        {collapsibleContent}
      </SidebarHoverPanel>
    );
  }

  return collapsibleContent;
}
