import { Skeleton } from "@/components/ui/skeleton";

interface ProjectIntroProps {
  isLoading: boolean;
  pageTitle: string;
}

export default function ProjectIntro({ isLoading, pageTitle }: ProjectIntroProps) {
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
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Project / 简介</div>
      <div className="text-base">{pageTitle}</div>
    </div>
  );
}
