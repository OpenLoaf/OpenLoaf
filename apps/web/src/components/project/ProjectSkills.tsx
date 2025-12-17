import { Skeleton } from "@/components/ui/skeleton";

interface ProjectSkillsProps {
  isLoading: boolean;
  pageId?: string;
}

export default function ProjectSkills({ isLoading, pageId }: ProjectSkillsProps) {
  if (isLoading) {
    return (
      <div className="h-full space-y-3 mt-3">
        <Skeleton className="h-10 w-[32%]" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Project / 技能</div>
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
}
