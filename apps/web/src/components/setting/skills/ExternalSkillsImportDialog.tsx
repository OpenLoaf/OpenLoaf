"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@openloaf/ui/button";
import { Checkbox } from "@openloaf/ui/checkbox";
import { Input } from "@openloaf/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { Badge } from "@openloaf/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { Loader2, Link2, Copy, Check, Search, X, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { isElectronEnv } from "@/utils/is-electron-env";

type ExternalSkill = {
  name: string;
  targetName: string;
  description: string;
  sourcePath: string;
  alreadyImported: boolean;
};

type ExternalSource = {
  sourceId: string;
  label: string;
  skills: ExternalSkill[];
};

type ExternalSkillsImportDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  projectId?: string;
};

const EMPTY_SOURCES: ExternalSource[] = [];

export function ExternalSkillsImportDialog({
  open,
  onOpenChangeAction,
  projectId,
}: ExternalSkillsImportDialogProps) {
  const { t } = useTranslation("settings");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Detect Windows on client side only to avoid SSR mismatch
  const [isWin, setIsWin] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent ?? "";
    if (ua.includes("Windows") || ua.includes("Win64") || ua.includes("Win32")) {
      setIsWin(true);
    }
  }, []);
  const [method, setMethod] = useState<"link" | "copy">("link");
  useEffect(() => {
    if (isWin) setMethod("copy");
  }, [isWin]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSourceFilter("all");
      setSearchQuery("");
    }
  }, [open]);

  const detectQuery = useQuery({
    ...trpc.settings.detectExternalSkills.queryOptions({ projectId }),
    enabled: open,
    staleTime: 60_000,
  });

  const sources: ExternalSource[] = detectQuery.data?.sources ?? EMPTY_SOURCES;
  const homePath = detectQuery.data?.homePath;
  const projectRootPath = detectQuery.data?.projectRootPath;

  const shortenPath = useCallback((fullPath: string) => {
    if (projectRootPath && fullPath.startsWith(projectRootPath)) {
      const rel = fullPath.slice(projectRootPath.length);
      return `.${rel}`;
    }
    if (homePath && fullPath.startsWith(homePath)) {
      return `~${fullPath.slice(homePath.length)}`;
    }
    return fullPath;
  }, [homePath, projectRootPath]);

  const filteredSources = useMemo(() => {
    if (sourceFilter === "all") return sources;
    return sources.filter((s) => s.sourceId === sourceFilter);
  }, [sources, sourceFilter]);

  const allSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return filteredSources.flatMap((s) =>
      s.skills
        .filter((skill) => {
          if (!query) return true;
          return (
            skill.name.toLowerCase().includes(query) ||
            skill.targetName.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query) ||
            skill.sourcePath.toLowerCase().includes(query)
          );
        })
        .map((skill) => ({
          ...skill,
          sourceId: s.sourceId,
          sourceLabel: s.label,
          key: `${s.sourceId}:${skill.sourcePath}`,
        })),
    );
  }, [filteredSources, searchQuery]);

  const selectableSkills = useMemo(
    () => allSkills.filter((s) => !s.alreadyImported),
    [allSkills],
  );

  const handleToggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === selectableSkills.length) {
        return new Set();
      }
      return new Set(selectableSkills.map((s) => s.key));
    });
  }, [selectableSkills]);

  const importMutation = useMutation(
    trpc.settings.importExternalSkills.mutationOptions({
      onSuccess: (data) => {
        if (data.ok && data.importedSkills.length > 0) {
          const msg = data.errors?.length
            ? t("skills.external.partialSuccess", {
                imported: data.importedSkills.length,
                errors: data.errors.length,
              })
            : t("skills.external.success", { count: data.importedSkills.length });
          toast.success(msg);
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getSkills.queryOptions().queryKey,
          });
          if (projectId) {
            queryClient.invalidateQueries({
              queryKey: trpc.settings.getSkills.queryOptions({ projectId }).queryKey,
            });
          }
          queryClient.invalidateQueries({
            queryKey: trpc.settings.detectExternalSkills.queryOptions({ projectId }).queryKey,
          });
          setSelected(new Set());
          onOpenChangeAction(false);
        } else if (data.errors?.length) {
          toast.error(data.errors.join("\n"));
        }
      },
      onError: (error) => {
        toast.error(error.message ?? t("skills.external.failed"));
      },
    }),
  );

  const localImportMutation = useMutation(
    trpc.settings.importSkill.mutationOptions({
      onSuccess: (data) => {
        if (data.ok && data.importedSkills.length > 0) {
          toast.success(t("skills.external.localImportSuccess", {
            count: data.importedSkills.length,
            defaultValue: `成功从本地导入 ${data.importedSkills.length} 个技能`,
          }));
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getSkills.queryOptions().queryKey,
          });
          if (projectId) {
            queryClient.invalidateQueries({
              queryKey: trpc.settings.getSkills.queryOptions({ projectId }).queryKey,
            });
          }
          queryClient.invalidateQueries({
            queryKey: trpc.settings.detectExternalSkills.queryOptions({ projectId }).queryKey,
          });
        } else if (data.error) {
          toast.error(data.error);
        }
      },
      onError: (error) => {
        toast.error(error.message ?? t("skills.external.failed"));
      },
    }),
  );

  const handleLocalFolderImport = useCallback(async () => {
    const api = window.openloafElectron;
    if (!api?.pickDirectory) return;
    const result = await api.pickDirectory();
    if (!result?.ok) return;
    const scope = projectId ? ("project" as const) : ("global" as const);
    localImportMutation.mutate({
      sourcePath: result.path,
      scope,
      projectId,
    });
  }, [projectId, localImportMutation]);

  const handleImport = useCallback(() => {
    const skillsToImport = allSkills
      .filter((s) => selected.has(s.key))
      .map((s) => ({
        sourceId: s.sourceId,
        sourcePath: s.sourcePath,
        targetName: s.targetName,
      }));
    if (skillsToImport.length === 0) return;
    const scope = projectId ? ("project" as const) : ("global" as const);
    importMutation.mutate({
      skills: skillsToImport,
      method,
      scope,
      projectId,
    });
  }, [allSkills, selected, method, projectId, importMutation]);

  const isImporting = importMutation.isPending;
  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:!max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{t("skills.external.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("skills.external.dialogDesc")}</DialogDescription>
        </DialogHeader>

        {/* Search + Source filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              type="text"
              placeholder={t("skills.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-3xl border-transparent bg-muted/40 pl-8 pr-7 text-sm focus:border-border"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {sources.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant={sourceFilter === "all" ? "secondary" : "ghost"}
                className="h-8 rounded-3xl px-2.5 text-xs"
                onClick={() => setSourceFilter("all")}
              >
                {t("skills.external.filterAll")}
              </Button>
              {sources.map((s) => (
                <Button
                  key={s.sourceId}
                  size="sm"
                  variant={sourceFilter === s.sourceId ? "secondary" : "ghost"}
                  className="h-8 rounded-3xl px-2.5 text-xs"
                  onClick={() => setSourceFilter(s.sourceId)}
                >
                  {s.label}
                  <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                    {s.skills.length}
                  </Badge>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Skill list */}
        <div className="max-h-[50vh] min-h-[200px] overflow-y-auto rounded-xl border">
          {detectQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("skills.external.detecting")}
            </div>
          ) : allSkills.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {searchQuery ? t("skills.noMatch") : t("skills.external.noSkills")}
            </div>
          ) : (
            <div className="divide-y">
              {/* Select all header */}
              {selectableSkills.length > 0 && (
                <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b bg-background/95 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm hover:bg-muted/50">
                  <Checkbox
                    checked={selected.size === selectableSkills.length && selectableSkills.length > 0}
                    onCheckedChange={handleToggleAll}
                  />
                  <span>
                    {selected.size === selectableSkills.length
                      ? t("skills.external.deselectAll")
                      : t("skills.external.selectAll", { count: selectableSkills.length })}
                  </span>
                </label>
              )}
              {allSkills.map((skill) => (
                <Tooltip key={skill.key}>
                  <TooltipTrigger asChild>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40",
                        skill.alreadyImported && "opacity-50 cursor-default",
                      )}
                    >
                      <Checkbox
                        checked={skill.alreadyImported || selected.has(skill.key)}
                        disabled={skill.alreadyImported}
                        onCheckedChange={() => handleToggle(skill.key)}
                      />
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {skill.sourceLabel}
                      </Badge>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{skill.targetName}</span>
                        {skill.description && (
                          <span className="truncate text-xs text-muted-foreground">
                            {skill.description}
                          </span>
                        )}
                      </div>
                      {skill.alreadyImported && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          <Check className="mr-0.5 h-3 w-3" />
                          {t("skills.external.alreadyImported")}
                        </Badge>
                      )}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-sm text-xs">
                    {shortenPath(skill.sourcePath)}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        {/* Bottom bar: method selector + action buttons in one row */}
        <div className="flex items-center gap-3">
          <Select value={method} onValueChange={(v) => setMethod(v as "link" | "copy")}>
            <SelectTrigger className="h-8 w-48 shrink-0 rounded-3xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!isWin && (
                <SelectItem value="link">
                  <Link2 className="mr-1.5 inline h-3.5 w-3.5" />
                  {t("skills.external.methodLink")}
                </SelectItem>
              )}
              <SelectItem value="copy">
                <Copy className="mr-1.5 inline h-3.5 w-3.5" />
                {t("skills.external.methodCopy")}
              </SelectItem>
            </SelectContent>
          </Select>
          {isElectronEnv() && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-3xl"
              onClick={handleLocalFolderImport}
              disabled={localImportMutation.isPending}
            >
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {localImportMutation.isPending
                ? t("skills.external.importing")
                : t("skills.external.localFolderImport", { defaultValue: "从本地文件夹导入" })}
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            onClick={() => onOpenChangeAction(false)}
            className="rounded-3xl"
          >
            {t("skills.transfer.cancel")}
          </Button>
          <Button
            autoFocus
            onClick={handleImport}
            disabled={selectedCount === 0 || isImporting}
            className="rounded-3xl"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {t("skills.external.importing")}
              </>
            ) : (
              t("skills.external.importSelected", { count: selectedCount })
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
