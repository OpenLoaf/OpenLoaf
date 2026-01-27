import { memo, useMemo, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { Switch } from "@tenas-ai/ui/animate-ui/components/radix/switch";
import { Checkbox } from "@tenas-ai/ui/checkbox";
import { Label } from "@tenas-ai/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import { Button } from "@tenas-ai/ui/button";
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
    .map((hour) => `${hour}时`)
    .join("、");

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
      title: "项目汇总历史",
      params: { projectId, scope: "project" },
    });
  }

  if (!projectId) return null;

  return (
    <div className="space-y-3">
      <TenasSettingsGroup
        title="AI设置"
        subtitle="覆盖工作空间设置后可配置当前项目的自动总结。"
      >
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">覆盖工作空间设置</div>
              <div className="text-xs text-muted-foreground">
                开启后可自定义项目级别的自动总结规则
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={overrideEnabled}
                  onCheckedChange={(checked) =>
                    updateAiSettings({ overrideEnabled: checked })
                  }
                  aria-label="Override workspace settings"
                />
              </div>
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">资料自动总结</div>
              <div className="text-xs text-muted-foreground">
                自动总结项目资料并按计划生成记录
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={effectiveAutoSummaryEnabled}
                  onCheckedChange={(checked) =>
                    updateAiSettings({ autoSummaryEnabled: checked })
                  }
                  disabled={!overrideEnabled}
                  aria-label="Auto summary"
                />
              </div>
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">自动总结时间</div>
              <div className="text-xs text-muted-foreground">
                选择一天内需要自动总结的小时
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-[360px] shrink-0">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">
                  {autoSummaryLabel || "-"}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" disabled={!overrideEnabled}>
                      设置
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
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">立即触发</div>
              <div className="text-xs text-muted-foreground">
                选择任意日期进行日汇总（覆盖同日记录）
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-[360px] shrink-0">
              <div className="flex items-center justify-end gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline">
                      执行
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
                        立即触发
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button type="button" variant="ghost" onClick={handleOpenHistoryPanel}>
                  历史面板
                </Button>
              </div>
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>
    </div>
  );
});

export { ProjectAiSettings };
