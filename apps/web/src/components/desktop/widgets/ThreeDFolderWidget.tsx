"use client";

import * as React from "react";
import { AnimatedFolder } from "@/components/ui/3d-folder";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";

type FolderProject = {
  /** Project id for the preview card. */
  id: string;
  /** Preview image url. */
  image: string;
  /** Preview title. */
  title: string;
};

/** Default preview cards for the widget. */
const FALLBACK_PROJECTS: FolderProject[] = [
  { id: "folder-preview-1", image: "", title: "Preview A" },
  { id: "folder-preview-2", image: "", title: "Preview B" },
  { id: "folder-preview-3", image: "", title: "Preview C" },
];

/** Resolve a friendly folder title based on the selected URI. */
function resolveFolderTitle(folderUri?: string) {
  if (!folderUri) return "Folder";
  const displayPath = getDisplayPathFromUri(folderUri);
  const parts = displayPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "Folder";
}

export interface ThreeDFolderWidgetProps {
  /** Optional folder display title override. */
  title?: string;
  /** Selected folder uri (tenas-file). */
  folderUri?: string;
  /** Optional preview projects override. */
  projects?: FolderProject[];
}

/** Render the 3D folder widget preview. */
export default function ThreeDFolderWidget({
  title,
  folderUri,
  projects,
}: ThreeDFolderWidgetProps) {
  const resolvedTitle = React.useMemo(() => {
    // 中文注释：优先使用外部传入的标题，其次从目录路径提取显示名。
    if (title && title.trim().length > 0) return title.trim();
    return resolveFolderTitle(folderUri);
  }, [folderUri, title]);

  return (
    <AnimatedFolder
      title={resolvedTitle}
      projects={projects ?? FALLBACK_PROJECTS}
      className="w-full"
    />
  );
}
