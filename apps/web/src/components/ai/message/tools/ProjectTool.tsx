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

import React from "react";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { getProjectsQueryKey } from "@/hooks/use-projects";
import { queryClient } from "@/utils/trpc";
import UnifiedTool from "./UnifiedTool";
import {
  asPlainObject,
  getToolKind,
  getToolOutputState,
  normalizeToolInput,
  type AnyToolPart,
  type ToolVariant,
} from "./shared/tool-utils";

/** Project tools that should trigger project tree refresh. */
const PROJECT_TOOL_MUTATIONS = new Set(["project-mutate"]);

/** Extract project info from tool output. */
function extractProjectInfo(output: unknown):
  | {
      projectId: string;
      title?: string;
      icon?: string | null;
    }
  | null {
  const normalized = normalizeToolInput(output);
  const root = asPlainObject(normalized) ?? null;
  if (!root) return null;
  const data = asPlainObject(root.data) ?? root;
  const project = asPlainObject(data.project) ?? null;
  if (!project) return null;
  const projectId = typeof project.projectId === "string" ? project.projectId.trim() : "";
  if (!projectId) return null;
  const title = typeof project.title === "string" ? project.title : undefined;
  const icon = typeof project.icon === "string" || project.icon === null
    ? (project.icon as string | null)
    : undefined;
  return { projectId, title, icon };
}

/** Project tool wrapper for mutation side effects. */
export default function ProjectTool({
  part,
  className,
  variant,
  messageId,
}: {
  part: AnyToolPart;
  className?: string;
  variant?: ToolVariant;
  messageId?: string;
}) {
  const handledRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
    if (!toolCallId || handledRef.current.has(toolCallId)) return;
    const toolKind = getToolKind(part).toLowerCase();
    if (!PROJECT_TOOL_MUTATIONS.has(toolKind)) return;

    const { hasErrorText } = getToolOutputState(part);
    const isDenied = part.state === "output-denied" || part.approval?.approved === false;
    const isDone = part.output != null || part.state === "output-available";
    if (!isDone || hasErrorText || isDenied) return;

    // 工具成功完成后刷新项目树，并同步已打开的项目视图元信息。
    handledRef.current.add(toolCallId);
    queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });

    const projectInfo = extractProjectInfo(part.output);
    if (!projectInfo) return;

    const baseId = `project:${projectInfo.projectId}`;
    const currentBase = useLayoutState.getState().base;
    if (currentBase?.id === baseId) {
      if (projectInfo.title) useAppView.getState().setTitle(projectInfo.title);
      if (projectInfo.icon !== undefined) useAppView.getState().setIcon(projectInfo.icon);
    }
  }, [part]);

  return (
    <UnifiedTool
      part={part}
      className={className}
      variant={variant}
      messageId={messageId}
    />
  );
}
