import { StepUpStepShell } from "@/components/step-up/StepUpStepShell";

export type StepUpFinishSummary = {
  workspace: string;
  model: string;
  provider: string;
};

type StepUpFinishStepProps = {
  summary: StepUpFinishSummary;
};

/** Render the finish confirmation step. */
export function StepUpFinishStep({ summary }: StepUpFinishStepProps) {
  return (
    <StepUpStepShell
      title="设置完成"
      subtitle="你可以在进入后随时修改这些配置。"
    >
      <div className="divide-y divide-border rounded-3xl border border-border bg-background/80">
        <div className="flex items-center justify-between gap-4 px-6 py-4 text-sm">
          <span className="text-muted-foreground">备份方式</span>
          <span className="font-medium">{summary.workspace}</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-6 py-4 text-sm">
          <span className="text-muted-foreground">模型来源</span>
          <span className="font-medium">{summary.model}</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-6 py-4 text-sm">
          <span className="text-muted-foreground">模型供应商</span>
          <span className="font-medium">{summary.provider}</span>
        </div>
      </div>
    </StepUpStepShell>
  );
}
