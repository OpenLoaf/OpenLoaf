import { Skeleton } from "@/components/ui/skeleton";

interface PlantCanvasProps {
  isLoading: boolean;
  pageId?: string;
  pageTitle: string;
}

export default function PlantCanvas({
  isLoading,
  pageId,
  pageTitle,
}: PlantCanvasProps) {
  if (isLoading) {
    return (
      <div className="h-full space-y-4 mt-3">
        <Skeleton className="h-10 w-[40%]" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Plant / 画布</div>
      <div className="text-base">{pageTitle}</div>
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
}
