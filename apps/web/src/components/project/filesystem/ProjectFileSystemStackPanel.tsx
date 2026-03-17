"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import ProjectFileSystem from "./components/ProjectFileSystem";
import { useProject } from "@/hooks/use-project";
import { useProjectStorageRootUri } from "@/hooks/use-project-storage-root-uri";

type ProjectFileSystemStackPanelProps = {
  /** Optional project scope for project-relative filesystem browsing. */
  projectId?: string;
  /** Optional root uri injected by caller to avoid an extra lookup. */
  rootUri?: string;
  /** Initial folder uri to display. */
  currentUri?: string | null;
};

/** Stack-friendly filesystem panel that manages its own current folder state. */
export default function ProjectFileSystemStackPanel({
  projectId,
  rootUri,
  currentUri,
}: ProjectFileSystemStackPanelProps) {
  const { t } = useTranslation("project");
  const projectQuery = useProject(projectId);
  const globalRootUri = useProjectStorageRootUri();
  const [activeUri, setActiveUri] = React.useState<string | null>(currentUri ?? null);

  React.useEffect(() => {
    setActiveUri(currentUri ?? null);
  }, [currentUri]);

  const resolvedRootUri = React.useMemo(() => {
    const explicitRootUri = rootUri?.trim();
    if (explicitRootUri) return explicitRootUri;
    const projectRootUri = projectQuery.data?.project?.rootUri?.trim();
    if (projectRootUri) return projectRootUri;
    const fallbackRootUri = globalRootUri?.trim();
    return fallbackRootUri || undefined;
  }, [globalRootUri, projectQuery.data?.project?.rootUri, rootUri]);

  if (!resolvedRootUri) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("filesystem.loading")}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ProjectFileSystem
        projectId={projectId}
        rootUri={resolvedRootUri}
        currentUri={activeUri}
        isLoading={Boolean(projectId) && projectQuery.isLoading}
        isActive={false}
        canConvertToSubproject={false}
        onNavigate={setActiveUri}
      />
    </div>
  );
}
