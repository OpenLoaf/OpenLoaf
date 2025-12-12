import { Skeleton } from "@/components/ui/skeleton";

interface PlantMaterialsProps {
  isLoading: boolean;
  pageId?: string;
}

export default function PlantMaterials({
  isLoading,
  pageId,
}: PlantMaterialsProps) {
  if (isLoading) {
    return (
      <div className="h-full space-y-3 mt-3">
        <Skeleton className="h-10 w-[32%]" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Plant / 资料</div>
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
}
