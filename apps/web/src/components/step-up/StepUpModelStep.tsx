import { Cloud, SlidersHorizontal } from "lucide-react";
import { StepUpChoiceStep } from "@/components/step-up/StepUpChoiceStep";

export type StepUpModelChoice = "custom" | "cloud";

type StepUpModelStepProps = {
  value: StepUpModelChoice | null;
  onSelect: (next: StepUpModelChoice) => void;
};

/** Render the model source selection step. */
export function StepUpModelStep({ value, onSelect }: StepUpModelStepProps) {
  return (
    <StepUpChoiceStep
      title="你希望模型由谁提供？"
      subtitle="选择自己的模型或直接使用 TeaTime Cloud。"
      value={value}
      onSelect={(next) => onSelect(next as StepUpModelChoice)}
      options={[
        {
          id: "cloud",
          title: "TeaTime Cloud",
          description: "官方托管服务",
          badge: "推荐",
          icon: <Cloud className="size-6" />,
        },
        {
          id: "custom",
          title: "自定义 AI 大模型",
          description: "使用自己的 API Key",
          icon: <SlidersHorizontal className="size-6" />,
        },
      ]}
    />
  );
}
