/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Cloud, SlidersHorizontal } from "lucide-react";
import { StepUpChoiceStep } from "@/components/step-up/StepUpChoiceStep";

export type StepUpModelChoice = "custom" | "cloud";

type StepUpModelStepProps = {
  /** Current selection. */
  value: StepUpModelChoice | null;
  /** Selection change handler. */
  onSelect: (next: StepUpModelChoice) => void;
};

/** Render the model source selection step. */
export function StepUpModelStep({ value, onSelect }: StepUpModelStepProps) {
  return (
    <StepUpChoiceStep
      title="你希望模型由谁提供？"
      subtitle="选择自己的模型或直接使用 OpenLoaf Cloud。"
      value={value}
      onSelect={(next) => onSelect(next as StepUpModelChoice)}
      options={[
        {
          id: "cloud",
          title: "OpenLoaf Cloud",
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
