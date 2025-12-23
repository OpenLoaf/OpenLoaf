"use client";

import { lazy, memo, Suspense } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import ProjectTitle from "../ProjectTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdleMount } from "@/hooks/use-idle-mount";

const LazyProjectInfoPlate = lazy(() =>
  import("./ProjectIntroPlate").then((module) => ({
    default: module.ProjectInfoPlate,
  }))
);

interface ProjectIntroHeaderProps {
  isLoading: boolean;
  pageId?: string;
  pageTitle: string;
  titleIcon?: string;
  currentTitle?: string;
  isUpdating: boolean;
  onUpdateTitle: (nextTitle: string) => void;
  onUpdateIcon: (nextIcon: string) => void;
}

interface ProjectIntroProps {
  isLoading: boolean;
  isActive: boolean;
  pageId?: string;
  pageTitle: string;
}

/** Fallback content while the intro editor loads. */
function ProjectIntroFallback() {
  return (
    <div className="space-y-3 px-10 pt-1">
      <Skeleton className="h-5 w-[35%]" />
      <Skeleton className="h-4 w-[60%]" />
      <Skeleton className="h-4 w-[48%]" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** Project intro panel. */
const ProjectInfo = memo(function ProjectInfo({
  isLoading,
  isActive,
  pageId,
  pageTitle,
}: ProjectIntroProps) {
  const blocksQuery = useQuery(
    trpc.pageCustom.getBlocks.queryOptions(
      pageId
        ? {
          pageId,
        }
        : skipToken
    )
  );

  const blocks = blocksQuery.data?.blocks ?? [];

  const showLoading = isLoading || (!!pageId && blocksQuery.isLoading);
  const shouldMountEditor = useIdleMount(isActive && !showLoading, { timeoutMs: 420 });
  const showFallback = isActive && !shouldMountEditor;

  if (showLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3 flex-1 min-h-0">
      {shouldMountEditor ? (
        <Suspense fallback={<ProjectIntroFallback />}>
          <LazyProjectInfoPlate
            readOnly={true}
            pageId={pageId}
            blocks={blocks}
            pageTitle={pageTitle}
          />
        </Suspense>
      ) : showFallback ? (
        <ProjectIntroFallback />
      ) : null}
    </div>
  );
});

/** Project intro header. */
const ProjectIntroHeader = memo(function ProjectIntroHeader({
  isLoading,
  pageId,
  pageTitle,
  titleIcon,
  currentTitle,
  isUpdating,
  onUpdateTitle,
  onUpdateIcon,
}: ProjectIntroHeaderProps) {
  return (
    <ProjectTitle
      isLoading={isLoading}
      pageId={pageId}
      pageTitle={pageTitle}
      titleIcon={titleIcon}
      currentTitle={currentTitle}
      isUpdating={isUpdating}
      onUpdateTitle={onUpdateTitle}
      onUpdateIcon={onUpdateIcon}
    />
  );
});

export { ProjectIntroHeader };
export default ProjectInfo;
