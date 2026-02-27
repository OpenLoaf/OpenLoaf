/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { StepUpOptionCard } from "@/components/step-up/StepUpOptionCard";
import { StepUpStepShell } from "@/components/step-up/StepUpStepShell";

export type StepUpChoiceOption = {
  /** Stable option id. */
  id: string;
  /** Title shown in the option card. */
  title: string;
  /** Supporting description text. */
  description: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional corner badge label. */
  badge?: string;
};

type StepUpChoiceStepProps = {
  /** Step title. */
  title: string;
  /** Step subtitle. */
  subtitle: string;
  /** All selectable options. */
  options: StepUpChoiceOption[];
  /** Currently selected option id. */
  value: string | null;
  /** Selection change handler. */
  onSelect: (next: string) => void;
};

/** Render a shared choice step with hover emphasis. */
export function StepUpChoiceStep({
  title,
  subtitle,
  options,
  value,
  onSelect,
}: StepUpChoiceStepProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const isHovered = hovered !== null;

  /** Compute scale class for option cards. */
  const getCardScale = (choiceId: string) => {
    if (isHovered) return hovered === choiceId ? "scale-100" : "scale-[0.8]";
    return value === choiceId ? "scale-100" : "scale-[0.8]";
  };

  /** Debounce hover start to avoid jitter on fast moves. */
  const handleHoverStart = (choiceId: string) => {
    // 快速划过时不触发放大，避免视觉抖动。
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHovered(choiceId);
      hoverTimerRef.current = null;
    }, 200);
  };

  /** Cancel hover state when pointer leaves. */
  const handleHoverEnd = () => {
    // 离开时清理延时，保证 hover 状态及时复位。
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(null);
  };

  return (
    <StepUpStepShell
      title={title}
      subtitle={subtitle}
    >
      <div className="mx-auto grid max-w-3xl gap-4">
        {options.map((option) => (
          <StepUpOptionCard
            key={option.id}
            title={option.title}
            description={option.description}
            selected={value === option.id}
            icon={option.icon}
            cornerBadge={option.badge}
            onClick={() => onSelect(option.id)}
            className={getCardScale(option.id)}
            onMouseEnter={() => handleHoverStart(option.id)}
            onMouseLeave={handleHoverEnd}
          />
        ))}
      </div>
    </StepUpStepShell>
  );
}
