import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StepUpOptionCard } from "@/components/step-up/StepUpOptionCard";
import { StepUpStepShell } from "@/components/step-up/StepUpStepShell";
import { ProviderEditorDialog } from "@/components/setting/menus/model/ProviderEditorDialog";
import { useSettingsValues } from "@/hooks/use-settings";
import { getModelLabel, resolveModelDefinition } from "@/lib/model-registry";
import type { ModelDefinition } from "@teatime-ai/api/common";

type StepUpProviderEntry = {
  /** Entry display name. */
  key: string;
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled model ids. */
  modelIds: string[];
  /** Custom model definitions. */
  customModels?: ModelDefinition[];
};

export type StepUpProviderSelection = {
  key: string;
  display: string;
};

type StepUpProviderStepProps = {
  selectedKey: string | null;
  onSelect: (selection: StepUpProviderSelection) => void;
};

/** Render the provider configuration step. */
export function StepUpProviderStep({
  selectedKey,
  onSelect,
}: StepUpProviderStepProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { items, setValue } = useSettingsValues();

  const entries = useMemo(() => {
    const list: StepUpProviderEntry[] = [];
    for (const item of items) {
      if ((item.category ?? "general") !== "provider") continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<StepUpProviderEntry>;
      if (!entry.providerId || !entry.apiUrl || !entry.authConfig) continue;
      list.push({
        key: item.key,
        providerId: entry.providerId,
        apiUrl: entry.apiUrl,
        authConfig: entry.authConfig as Record<string, unknown>,
        modelIds: Array.isArray(entry.modelIds) ? entry.modelIds : [],
        customModels: Array.isArray(entry.customModels) ? entry.customModels : [],
      });
    }
    return list;
  }, [items]);

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? null;

  return (
    <StepUpStepShell
      title="选择你的模型供应商"
      subtitle="选定供应商并填写 Key 才能继续。"
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
            新增供应商
          </Button>
        </div>
        <div className="mx-auto grid max-w-3xl gap-4">
          {entries.map((entry) => (
            <StepUpOptionCard
              key={entry.key}
              title={entry.key}
              description={
                entry.modelIds.length > 0
                  ? entry.modelIds
                      .map((modelId) => {
                        const modelDefinition =
                          resolveModelDefinition(entry.providerId, modelId) ??
                          entry.customModels?.find((model) => model.id === modelId);
                        return modelDefinition ? getModelLabel(modelDefinition) : modelId;
                      })
                      .join("、")
                  : "未配置模型"
              }
              selected={selectedEntry?.key === entry.key}
              onClick={() => onSelect({ key: entry.key, display: entry.key })}
            />
          ))}
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              暂无模型供应商，请先新增。
            </div>
          ) : null}
        </div>
      </div>
      <ProviderEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingKeys={entries.map((entry) => entry.key)}
        onSubmit={async (payload) => {
          await setValue(payload.key, payload, "provider");
          onSelect({ key: payload.key, display: payload.key });
        }}
      />
    </StepUpStepShell>
  );
}
