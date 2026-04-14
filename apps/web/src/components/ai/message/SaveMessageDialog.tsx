/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { skipToken } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@openloaf/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { trpc } from "@/utils/trpc";
import { buildUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";

type SaveMessageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Markdown content to save. */
  content: string;
  /** Locked project id (for project-scoped chats). */
  lockedProjectId?: string;
};

type FolderEntry = {
  uri: string;
  name: string;
};

function FolderItem({
  entry,
  isActive,
  onClick,
}: {
  entry: FolderEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs rounded-3xl transition-colors",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground hover:bg-muted/60",
      )}
      onClick={onClick}
    >
      {isActive ? (
        <FolderOpen className="size-3.5 shrink-0 text-primary" />
      ) : (
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function SaveMessageDialog({
  open,
  onOpenChange,
  content,
  lockedProjectId,
}: SaveMessageDialogProps) {
  const { t } = useTranslation(["ai", "common"]);
  const { data: projects = [] } = useProjects();

  // Flatten project tree
  const flatProjects = useMemo(() => {
    const result: Array<{ projectId: string; rootUri: string; title: string }> = [];
    const walk = (items: typeof projects) => {
      for (const item of items) {
        if (item.projectId) {
          result.push({
            projectId: item.projectId,
            rootUri: item.rootUri,
            title: item.title,
          });
        }
        if (item.children?.length) walk(item.children as typeof projects);
      }
    };
    walk(projects);
    return result;
  }, [projects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [currentUri, setCurrentUri] = useState<string>("");
  const [fileName, setFileName] = useState("");

  // Initialize state when dialog opens
  useEffect(() => {
    if (!open) return;
    const defaultProject = lockedProjectId
      ? flatProjects.find((p) => p.projectId === lockedProjectId)
      : flatProjects[0];
    if (defaultProject) {
      setSelectedProjectId(defaultProject.projectId);
      setCurrentUri(defaultProject.rootUri);
    }
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    setFileName(`message-${ts}.md`);
  }, [open, lockedProjectId, flatProjects]);

  const selectedProject = useMemo(
    () => flatProjects.find((p) => p.projectId === selectedProjectId),
    [flatProjects, selectedProjectId],
  );

  // Breadcrumb path
  const breadcrumbSegments = useMemo(() => {
    if (!selectedProject || !currentUri) return [];
    if (currentUri === selectedProject.rootUri) return [];
    const rootPath = selectedProject.rootUri.replace(/\/$/, "");
    const rel = currentUri.startsWith(rootPath)
      ? currentUri.slice(rootPath.length).replace(/^\//, "")
      : "";
    if (!rel) return [];
    return rel.split("/").filter(Boolean);
  }, [selectedProject, currentUri]);

  // Fetch folder entries
  const folderQuery = useQuery(
    trpc.fs.list.queryOptions(
      selectedProjectId && currentUri
        ? { projectId: selectedProjectId, uri: currentUri }
        : skipToken,
    ),
  );

  const folders = useMemo(() => {
    const entries = (folderQuery.data?.entries ?? []) as Array<{ uri: string; name: string; kind: string }>;
    return entries
      .filter((e) => e.kind === "directory")
      .map((e) => ({ uri: e.uri, name: e.name }));
  }, [folderQuery.data]);

  const handleProjectChange = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      const project = flatProjects.find((p) => p.projectId === projectId);
      if (project) setCurrentUri(project.rootUri);
    },
    [flatProjects],
  );

  const handleFolderOpen = useCallback((uri: string) => {
    setCurrentUri(uri);
  }, []);

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      if (!selectedProject) return;
      if (index < 0) {
        setCurrentUri(selectedProject.rootUri);
        return;
      }
      const rootPath = selectedProject.rootUri.replace(/\/$/, "");
      const segments = breadcrumbSegments.slice(0, index + 1);
      setCurrentUri(`${rootPath}/${segments.join("/")}`);
    },
    [selectedProject, breadcrumbSegments],
  );

  // Save
  const writeFileMutation = useMutation(trpc.fs.writeFile.mutationOptions());

  const handleSave = useCallback(async () => {
    if (!selectedProjectId || !currentUri || !fileName.trim()) return;
    const name = fileName.trim().endsWith(".md") ? fileName.trim() : `${fileName.trim()}.md`;
    const uri = buildUriFromRoot(currentUri, name);
    if (!uri) return;
    try {
      await writeFileMutation.mutateAsync({
        projectId: selectedProjectId,
        uri,
        content,
      });
      toast.success(t("ai:message.saveSuccess"));
    } catch (err) {
      toast.error(t("ai:message.saveFailed"));
      console.error(err);
      throw err;
    }
  }, [selectedProjectId, currentUri, fileName, content, writeFileMutation, t]);

  const availableProjects = lockedProjectId
    ? flatProjects.filter((p) => p.projectId === lockedProjectId)
    : flatProjects;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("ai:message.saveAsMarkdown")}
      onSubmit={handleSave}
      submitDisabled={!fileName.trim() || !selectedProjectId}
      contentClassName="max-w-md"
    >
      <div className="space-y-3">
          {/* Project selector */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("ai:message.saveProject")}</label>
            <Select
              value={selectedProjectId}
              onValueChange={handleProjectChange}
              disabled={Boolean(lockedProjectId)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.projectId} value={p.projectId} className="text-xs">
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-h-[20px] flex-wrap">
            <button
              type="button"
              className="hover:text-foreground transition-colors shrink-0"
              onClick={() => handleBreadcrumbClick(-1)}
            >
              {selectedProject?.title ?? "—"}
            </button>
            {breadcrumbSegments.map((seg, i) => (
              <span key={seg} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                <button
                  type="button"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    i === breadcrumbSegments.length - 1 && "text-foreground font-medium",
                  )}
                  onClick={() => handleBreadcrumbClick(i)}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>

          {/* Folder browser */}
          <div className="border rounded-3xl h-48 overflow-y-auto p-1">
            {folderQuery.isLoading ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {t("common:loading")}
              </div>
            ) : folders.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {t("ai:message.saveNoFolders")}
              </div>
            ) : (
              folders.map((folder) => (
                <FolderItem
                  key={folder.uri}
                  entry={folder}
                  isActive={false}
                  onClick={() => handleFolderOpen(folder.uri)}
                />
              ))
            )}
          </div>

          {/* Filename */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("ai:message.saveFileName")}</label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="h-8 text-xs"
              placeholder="message.md"
              autoFocus
            />
          </div>
      </div>
    </FormDialog>
  );
}
