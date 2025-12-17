import { Skeleton } from "@/components/ui/skeleton";
import { ProjectInfoPlate } from "./ProjectInfoPlate";

interface ProjectIntroProps {
  isLoading: boolean;
  pageTitle: string;
  introMarkdown?: string;
}

export default function ProjectInfo({
  isLoading,
  pageTitle,
  introMarkdown,
}: ProjectIntroProps) {
  if (isLoading) {
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
    <div className="h-full space-y-3">
      <div className="flex-1 min-h-0">
        <ProjectInfoPlate
          markdown={
            introMarkdown ??
            `# ${pageTitle}\n\n在这里写项目简介（支持 **Markdown** / _MDX_）。\n`
          }
        />
      </div>
    </div>
  );
}
