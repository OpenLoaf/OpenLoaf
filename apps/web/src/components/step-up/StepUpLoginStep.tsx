import { StepUpOptionCard } from "@/components/step-up/StepUpOptionCard";
import { StepUpStepShell } from "@/components/step-up/StepUpStepShell";

export type StepUpLoginProviderOption = {
  id: string;
  label: string;
  description: string;
};

export type StepUpLoginRegionOption = {
  id: string;
  label: string;
  description: string;
};

type StepUpLoginStepProps = {
  loginProviders: StepUpLoginProviderOption[];
  loginRegions: StepUpLoginRegionOption[];
  selectedProvider: string | null;
  selectedRegion: string | null;
  onSelectProvider: (next: string) => void;
  onSelectRegion: (next: string) => void;
};

/** Render the login step. */
export function StepUpLoginStep({
  loginProviders,
  loginRegions,
  selectedProvider,
  selectedRegion,
  onSelectProvider,
  onSelectRegion,
}: StepUpLoginStepProps) {
  const loginProviderLabel =
    loginProviders.find((item) => item.id === selectedProvider)?.label ?? "";
  const loginRegionLabel =
    loginRegions.find((item) => item.id === selectedRegion)?.label ?? "";

  return (
    <StepUpStepShell title="登录后即可同步" subtitle="请选择登录区域与登录方式。">
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {loginRegions.map((region) => (
            <StepUpOptionCard
              key={region.id}
              title={region.label}
              description={region.description}
              selected={selectedRegion === region.id}
              onClick={() => onSelectRegion(region.id)}
            />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {loginProviders.map((option) => (
            <StepUpOptionCard
              key={option.id}
              title={option.label}
              description={option.description}
              selected={selectedProvider === option.id}
              onClick={() => onSelectProvider(option.id)}
            />
          ))}
        </div>
        <div
          className={`rounded-2xl border px-4 py-3 text-xs ${
            selectedProvider && selectedRegion
              ? "border-primary/20 bg-primary/5 text-primary"
              : "border-dashed text-muted-foreground"
          }`}
        >
          {selectedProvider && selectedRegion
            ? `已选择 ${loginRegionLabel} / ${loginProviderLabel} 登录`
            : "未选择登录区域或登录方式，无法继续"}
        </div>
      </div>
    </StepUpStepShell>
  );
}
