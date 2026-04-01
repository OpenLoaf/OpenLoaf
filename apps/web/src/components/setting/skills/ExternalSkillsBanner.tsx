"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Button } from "@openloaf/ui/button";
import { Download, X } from "lucide-react";
import { ExternalSkillsImportDialog } from "./ExternalSkillsImportDialog";

type ExternalSkillsBannerProps = {
  projectId?: string;
};

const DISMISSED_KEY = "openloaf:external-skills-dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export function ExternalSkillsBanner({ projectId }: ExternalSkillsBannerProps) {
  const { t } = useTranslation("settings");
  const [dismissed, setDismissedState] = useState(isDismissed);
  const [dialogOpen, setDialogOpen] = useState(false);

  const detectQuery = useQuery({
    ...trpc.settings.detectExternalSkills.queryOptions({ projectId }),
    enabled: !dismissed,
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

  const handleDismiss = () => {
    setDismissed();
    setDismissedState(true);
  };

  if (dismissed || totalCount === 0) return null;

  return (
    <>
      <div className="mx-4 mt-2 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-sm dark:border-blue-800/50 dark:bg-blue-950/30">
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
