"use client";

import { lazy, memo, Suspense } from "react";
import { Eye, PencilLine } from "lucide-react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import ProjectTitle from "../ProjectTitle";
import { Button } from "@/components/ui/button";

const LazyProjectInfoPlate = lazy(() =>
  import("./ProjectIntroPlate").then((module) => ({
    default: module.ProjectInfoPlate,
  }))
);

interface ProjectIntroHeaderProps {
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

interface ProjectIntroProps {
  isLoading: boolean;
  isActive: boolean;
  projectId?: string;
  rootUri?: string;
  projectTitle: string;
  readOnly: boolean;
}

/** Project intro panel. */
const ProjectInfo = memo(function ProjectInfo({
  isLoading,
  isActive,
  projectId,
  rootUri,
  projectTitle,
  readOnly,
}: ProjectIntroProps) {
  const blocksQuery = useQuery(
    trpc.project.getIntro.queryOptions(
      rootUri
        ? {
          rootUri,
        }
        : skipToken
    )
  );

  const blocks = blocksQuery.data?.blocks ?? [];

  const showLoading = isLoading || (!!rootUri && blocksQuery.isLoading);

  if (showLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3 flex-1 min-h-0">
      {isActive ? (
        <Suspense fallback={null}>
          <LazyProjectInfoPlate
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

/** Project intro header. */
const ProjectIntroHeader = memo(function ProjectIntroHeader({
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
}: ProjectIntroHeaderProps) {
  const toggleLabel = isReadOnly ? "Edit" : "View";
  const ToggleIcon = isReadOnly ? PencilLine : Eye;
  const toggleTitle = isReadOnly ? "Edit intro" : "View intro";

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

export { ProjectIntroHeader };
export default ProjectInfo;
