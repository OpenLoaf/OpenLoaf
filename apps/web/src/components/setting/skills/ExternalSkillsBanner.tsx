"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { Download, X } from "lucide-react";
import { ExternalSkillsImportDialog } from "./ExternalSkillsImportDialog";

type ExternalSkillsBannerProps = {
  projectId?: string;
};

const DISMISSED_KEY = "openloaf:external-skills-dismissed";
const DISMISSED_EVENT = "openloaf:external-skills-dismissed-change";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  } catch {
    // ignore
  }
}

function subscribeDismissed(cb: () => void) {
  window.addEventListener(DISMISSED_EVENT, cb);
  return () => window.removeEventListener(DISMISSED_EVENT, cb);
}

/** Hook to detect external skills availability (shared dismissed state via localStorage + event) */
export function useExternalSkillsDetect(projectId?: string) {
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => false);

  const detectQuery = useQuery({
    ...trpc.settings.detectExternalSkills.queryOptions({ projectId }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const totalCount = useMemo(() => {
    if (!detectQuery.data?.sources) return 0;
    return detectQuery.data.sources.reduce(
      (sum, s) => sum + s.skills.filter((sk) => !sk.alreadyImported).length,
      0,
    );
  }, [detectQuery.data]);

  const handleDismiss = useCallback(() => {
    writeDismissed();
  }, []);

  return { totalCount, dismissed, handleDismiss };
}

export function ExternalSkillsBanner({ projectId }: ExternalSkillsBannerProps) {
  const { t } = useTranslation("settings");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { totalCount, dismissed, handleDismiss } =
    useExternalSkillsDetect(projectId);

  if (dismissed || totalCount === 0) return null;

  return (
    <>
      <div className="mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-sm dark:border-blue-800/50 dark:bg-blue-950/30">
        <Download className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <span className="flex-1 text-blue-800 dark:text-blue-200">
          {t("skills.external.bannerTitle", { count: totalCount })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-3xl px-3 text-xs text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
          onClick={() => setDialogOpen(true)}
        >
          {t("skills.external.bannerAction")}
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300"
          aria-label={t("skills.external.bannerDismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ExternalSkillsImportDialog
        open={dialogOpen}
        onOpenChangeAction={setDialogOpen}
        projectId={projectId}
      />
    </>
  );
}

/** Compact icon button shown when banner is dismissed but external skills exist */
export function ExternalSkillsIconButton({
  projectId,
}: ExternalSkillsBannerProps) {
  const { t } = useTranslation("settings");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { totalCount, dismissed } = useExternalSkillsDetect(projectId);

  if (!dismissed || totalCount === 0) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="relative h-8 w-8 rounded-3xl text-muted-foreground hover:text-foreground"
            onClick={() => setDialogOpen(true)}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-medium text-white">
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t("skills.external.bannerTitle", { count: totalCount })}
        </TooltipContent>
      </Tooltip>
      <ExternalSkillsImportDialog
        open={dialogOpen}
        onOpenChangeAction={setDialogOpen}
        projectId={projectId}
      />
    </>
  );
}
