/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useMemo, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { Switch } from "@openloaf/ui/animate-ui/components/radix/switch";
import { Checkbox } from "@openloaf/ui/checkbox";
import { Label } from "@openloaf/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Button } from "@openloaf/ui/button";
import { trpc } from "@/utils/trpc";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

type ProjectAiSettingsProps = {
  /** Project id for AI settings. */
  projectId?: string;
  /** Project root uri (reserved). */
  rootUri?: string;
};

/** Project AI settings panel. */
const ProjectAiSettings = memo(function ProjectAiSettings({
  projectId,
}: ProjectAiSettingsProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const { basic } = useBasicConfig();
  const hourOptions = useMemo(() => Array.from({ length: 25 }, (_, hour) => hour), []);

  const aiSettingsQueryKey = useMemo(() => {
    if (!projectId) return undefined;
    return trpc.project.getAiSettings.queryOptions({ projectId }).queryKey;
  }, [projectId]);

  const aiSettingsQuery = useQuery({
    ...trpc.project.getAiSettings.queryOptions(projectId ? { projectId } : skipToken),
    staleTime: 5000,
  });

  const setAiSettings = useMutation(
    trpc.project.setAiSettings.mutationOptions({
      onSuccess: async () => {
        if (!aiSettingsQueryKey) return;
        await queryClient.invalidateQueries({ queryKey: aiSettingsQueryKey });
      },
    }),
  );
  const runSummaryForDay = useMutation(
    trpc.project.runSummaryForDay.mutationOptions({
      onSuccess: async () => {},
    }),
  );
  const [manualDate, setManualDate] = useState("");
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabRuntime((state) => state.pushStackItem);

  const aiSettings = aiSettingsQuery.data?.aiSettings ?? {};
  const overrideEnabled = aiSettings.overrideEnabled ?? false;
  const effectiveAutoSummaryEnabled = overrideEnabled
    ? (aiSettings.autoSummaryEnabled ?? basic.autoSummaryEnabled)
    : basic.autoSummaryEnabled;
  const effectiveAutoSummaryHours = overrideEnabled
    ? (aiSettings.autoSummaryHours ?? basic.autoSummaryHours)
    : basic.autoSummaryHours;
  const autoSummaryLabel = (effectiveAutoSummaryHours ?? [])
    .map((hour) => `${hour}:00`)
    .join(", ");

  function updateAiSettings(next: {
    overrideEnabled?: boolean;
    autoSummaryEnabled?: boolean;
    autoSummaryHours?: number[];
  }) {
    if (!projectId) return;
    const payload = {
      overrideEnabled: next.overrideEnabled ?? overrideEnabled,
      autoSummaryEnabled:
        next.autoSummaryEnabled ?? (aiSettings.autoSummaryEnabled ?? basic.autoSummaryEnabled),
      autoSummaryHours:
        next.autoSummaryHours ?? (aiSettings.autoSummaryHours ?? basic.autoSummaryHours),
    };
    setAiSettings.mutate({ projectId, aiSettings: payload });
  }

  function handleToggleAutoSummaryHour(hour: number) {
    if (!overrideEnabled) return;
    const next = new Set(effectiveAutoSummaryHours ?? []);
    if (next.has(hour)) {
      next.delete(hour);
    } else {
      next.add(hour);
    }
    // 逻辑：排序后写回，保持配置稳定输出。
    const sorted = Array.from(next).sort((a, b) => a - b);
    updateAiSettings({ autoSummaryHours: sorted });
  }

  function handleRunSummaryForDay() {
    if (!projectId || !manualDate) return;
    runSummaryForDay.mutate({ projectId, dateKey: manualDate });
  }

  function handleOpenHistoryPanel() {
    if (!activeTabId || !projectId) return;
    pushStackItem(activeTabId, {
      id: `summary-history:project:${projectId}`,
      sourceKey: `summary-history:project:${projectId}`,
      component: "scheduler-task-history",
      title: t("project.ai.summaryHistoryTitle"),
      params: { projectId, scope: "project" },
    });
  }

  if (!projectId) return null;

  return (
    <div className="space-y-3">
      <OpenLoafSettingsGroup
        title={t("project.tabAI")}
        subtitle={t("project.ai.subtitle")}
      >
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("project.ai.overrideWorkspace")}</div>
              <div className="text-xs text-muted-foreground">
                {t("project.ai.overrideWorkspaceDesc")}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={overrideEnabled}
                  onCheckedChange={(checked) =>
                    updateAiSettings({ overrideEnabled: checked })
                  }
                  aria-label={t("project.ai.overrideWorkspace")}
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("project.ai.autoSummary")}</div>
              <div className="text-xs text-muted-foreground">
                {t("project.ai.autoSummaryDesc")}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={effectiveAutoSummaryEnabled}
                  onCheckedChange={(checked) =>
                    updateAiSettings({ autoSummaryEnabled: checked })
                  }
                  disabled={!overrideEnabled}
                  aria-label={t("project.ai.autoSummary")}
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("project.ai.autoSummaryTime")}</div>
              <div className="text-xs text-muted-foreground">
                {t("project.ai.autoSummaryTimeDesc")}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-[360px] shrink-0">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">
                  {autoSummaryLabel || "-"}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" disabled={!overrideEnabled}>
                      {t("project.ai.configure")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[280px]">
                    <div className="grid grid-cols-5 gap-2">
                      {hourOptions.map((hour) => {
                        const checked = (effectiveAutoSummaryHours ?? []).includes(hour);
                        const id = `project-auto-summary-hour-${hour}`;
                        return (
                          <div key={hour} className="flex items-center gap-2">
                            <Checkbox
                              id={id}
                              checked={checked}
                              onCheckedChange={() => handleToggleAutoSummaryHour(hour)}
                              disabled={!overrideEnabled}
                            />
                            <Label htmlFor={id} className="text-xs">
                              {hour}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("project.ai.triggerNow")}</div>
              <div className="text-xs text-muted-foreground">
                {t("project.ai.triggerNowDesc")}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-[360px] shrink-0">
              <div className="flex items-center justify-end gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline">
                      {t("project.ai.execute")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[240px]">
                    <div className="space-y-3">
                      <input
                        type="date"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                        value={manualDate}
                        onChange={(event) => setManualDate(event.target.value)}
                      />
                      <Button
                        type="button"
                        onClick={handleRunSummaryForDay}
                        disabled={!manualDate || runSummaryForDay.isPending}
                      >
                        {t("project.ai.triggerNow")}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button type="button" variant="ghost" onClick={handleOpenHistoryPanel}>
                  {t("project.ai.historyPanel")}
                </Button>
              </div>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
});

export { ProjectAiSettings };
