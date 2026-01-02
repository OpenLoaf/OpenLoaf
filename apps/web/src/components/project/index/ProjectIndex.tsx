"use client";

import { lazy, memo, Suspense } from "react";
import { Eye, PencilLine } from "lucide-react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import ProjectTitle from "../ProjectTitle";
import { Button } from "@/components/ui/button";

const LazyProjectIndexPlate = lazy(() =>
  import("./ProjectIndexPlate").then((module) => ({
    default: module.ProjectIndexPlate,
  }))
);

interface ProjectIndexHeaderProps {
  isLoading: boolean;
  projectId?: string;
  projectTitle: string;
  titleIcon?: string;
  currentTitle?: string;
  isUpdating: boolean;
  onUpdateTitle: (nextTitle: string) => void;
  onUpdateIcon: (nextIcon: string) => void;
  isReadOnly: boolean;
  onSetReadOnly: (nextReadOnly: boolean) => void;
}

interface ProjectIndexProps {
  isLoading: boolean;
  isActive: boolean;
  projectId?: string;
  rootUri?: string;
  projectTitle: string;
  readOnly: boolean;
}

/** Project index panel. */
const ProjectIndex = memo(function ProjectIndex({
  isLoading,
  isActive,
  projectId,
  rootUri,
  projectTitle,
  readOnly,
}: ProjectIndexProps) {
  const blocksQuery = useQuery(
    trpc.project.getIntro.queryOptions(
      projectId
        ? {
            projectId,
          }
        : skipToken
    )
  );

  const blocks = blocksQuery.data?.blocks ?? [];

  const showLoading = isLoading || (!!projectId && blocksQuery.isLoading);

  if (showLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3 flex-1 min-h-0">
      {isActive ? (
        <Suspense fallback={null}>
          <LazyProjectIndexPlate
            readOnly={readOnly}
            projectId={projectId}
            rootUri={rootUri}
            blocks={blocks}
            projectTitle={projectTitle}
          />
        </Suspense>
      ) : null}
    </div>
  );
});

/** Project index header. */
const ProjectIndexHeader = memo(function ProjectIndexHeader({
  isLoading,
  projectId,
  projectTitle,
  titleIcon,
  currentTitle,
  isUpdating,
  onUpdateTitle,
  onUpdateIcon,
  isReadOnly,
  onSetReadOnly,
}: ProjectIndexHeaderProps) {
  const toggleLabel = isReadOnly ? "编辑" : "查看";
  const ToggleIcon = isReadOnly ? PencilLine : Eye;
  const toggleTitle = isReadOnly ? "编辑首页" : "查看首页";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <ProjectTitle
        isLoading={isLoading}
        projectId={projectId}
        projectTitle={projectTitle}
        titleIcon={titleIcon}
        currentTitle={currentTitle}
        isUpdating={isUpdating}
        onUpdateTitle={onUpdateTitle}
        onUpdateIcon={onUpdateIcon}
      />
      {isLoading ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={!projectId}
          onClick={() => onSetReadOnly(!isReadOnly)}
          aria-label={toggleTitle}
          title={toggleTitle}
        >
          <ToggleIcon className="size-4" />
          {toggleLabel}
        </Button>
      )}
    </div>
  );
});

export { ProjectIndexHeader };
export default ProjectIndex;
