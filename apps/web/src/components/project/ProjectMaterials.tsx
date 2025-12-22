import { memo } from "react";

interface ProjectMaterialsProps {
  isLoading: boolean;
  pageId?: string;
}

interface ProjectMaterialsHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Project materials header. */
const ProjectMaterialsHeader = memo(function ProjectMaterialsHeader({
  isLoading,
  pageTitle,
}: ProjectMaterialsHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">资料</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

const ProjectMaterials = memo(function ProjectMaterials({
  isLoading,
  pageId,
}: ProjectMaterialsProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full space-y-3">
      <div className="text-xs text-muted-foreground">pageId: {pageId ?? "-"}</div>
    </div>
  );
});

export { ProjectMaterialsHeader };
export default ProjectMaterials;
