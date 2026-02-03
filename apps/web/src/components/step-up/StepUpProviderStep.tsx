import { useMemo, useState } from "react";
import { Button } from "@tenas-ai/ui/button";
import { StepUpOptionCard } from "@/components/step-up/StepUpOptionCard";
import { StepUpStepShell } from "@/components/step-up/StepUpStepShell";
import { ProviderEditorDialog } from "@/components/setting/menus/model/ProviderEditorDialog";
import { useSettingsValues } from "@/hooks/use-settings";
import { getModelLabel, resolveModelDefinition } from "@/lib/model-registry";
import type { ModelDefinition } from "@tenas-ai/api/common";

type StepUpProviderEntry = {
  /** Entry display name. */
  key: string;
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled model definitions keyed by model id. */
  models: Record<string, ModelDefinition>;
};

export type StepUpProviderSelection = {
  /** Settings key for the provider entry. */
  key: string;
  /** Display label for the selected provider. */
  display: string;
};

type StepUpProviderStepProps = {
  /** Currently selected provider key. */
  selectedKey: string | null;
  /** Selection change handler. */
  onSelect: (selection: StepUpProviderSelection) => void;
};

/** Render the provider configuration step. */
export function StepUpProviderStep({
  selectedKey,
  onSelect,
}: StepUpProviderStepProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { providerItems, setValue } = useSettingsValues();

  const entries = useMemo(() => {
    // 过滤出有效的供应商配置，保障列表渲染稳定。
    const list: StepUpProviderEntry[] = [];
    for (const item of providerItems) {
      if ((item.category ?? "general") !== "provider") continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<StepUpProviderEntry>;
      if (!entry.providerId || !entry.apiUrl || !entry.authConfig) continue;
      list.push({
        key: item.key,
        providerId: entry.providerId,
        apiUrl: entry.apiUrl,
        authConfig: entry.authConfig as Record<string, unknown>,
        models: entry.models ?? {},
      });
    }
    return list;
  }, [providerItems]);

  // 基于当前 key 找到选中的供应商条目。
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
                Object.keys(entry.models).length > 0
                  ? Object.entries(entry.models)
                      .map(([modelId, modelDefinition]) =>
                        modelDefinition
                          ? getModelLabel(modelDefinition)
                          : resolveModelDefinition(entry.providerId, modelId)?.id ?? modelId,
                      )
                      .join("、")
                  : "未配置模型"
              }
              selected={selectedEntry?.key === entry.key}
              onClick={() => onSelect({ key: entry.key, display: entry.key })}
            />
          ))}
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {/* 当前无可用供应商时提示用户先新增。 */}
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
          // 保存新增供应商后立即选中，减少用户操作步骤。
          await setValue(payload.key, payload, "provider");
          onSelect({ key: payload.key, display: payload.key });
        }}
      />
    </StepUpStepShell>
  );
}
