"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ProjectInfoPlate } from "./ProjectIntroPlate";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

interface ProjectIntroProps {
  isLoading: boolean;
  pageId?: string;
  pageTitle: string;
  introMarkdown?: string;
}

export default function ProjectInfo({
  isLoading,
  pageId,
  pageTitle,
  introMarkdown,
}: ProjectIntroProps) {
  const markdownQuery = useQuery(
    trpc.page.findUniquePage.queryOptions(
      pageId
        ? {
            where: { id: pageId },
            select: { markdown: true },
          }
        : skipToken
    )
  );

  const markdown = markdownQuery.data?.markdown ?? introMarkdown;

  const showLoading = isLoading || (!!pageId && markdownQuery.isLoading && !introMarkdown);

  if (showLoading) {
    return (
      <div className="h-full space-y-4 mt-3">
        <Skeleton className="h-24 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[72%]" />
          <Skeleton className="h-4 w-[56%]" />
          <Skeleton className="h-4 w-[64%]" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 flex-1 min-h-0">
      <ProjectInfoPlate
        readOnly={false}
        markdown={
          markdown ??
          `# ${pageTitle}\n\n在这里写项目简介（支持 **Markdown** / _MDX_）。\n`
        }
      />
    </div>
  );
}
