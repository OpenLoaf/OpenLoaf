"use client";

import { ProjectInfoPlate } from "./ProjectIntroPlate";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

interface ProjectIntroProps {
  isLoading: boolean;
  pageId?: string;
  pageTitle: string;
}

/** Project intro panel. */
export default function ProjectInfo({
  isLoading,
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

  if (showLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3 flex-1 min-h-0">
      <ProjectInfoPlate
        readOnly={false}
        pageId={pageId}
        blocks={blocks}
        pageTitle={pageTitle}
      />
    </div>
  );
}
