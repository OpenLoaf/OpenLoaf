interface ProjectMaterialsProps {
  isLoading: boolean;
  pageId?: string;
}

export default function ProjectMaterials({
  isLoading,
  pageId,
}: ProjectMaterialsProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3 mt-3">
      <div className="text-sm text-muted-foreground">Project / 资料</div>
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
}
