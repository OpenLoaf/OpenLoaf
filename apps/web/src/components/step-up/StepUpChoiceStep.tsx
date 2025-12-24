"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { StepUpOptionCard } from "@/components/step-up/StepUpOptionCard";
import { StepUpStepShell } from "@/components/step-up/StepUpStepShell";

export type StepUpChoiceOption = {
  id: string;
  title: string;
  description: string;
  icon?: ReactNode;
  badge?: string;
};

type StepUpChoiceStepProps = {
  title: string;
  subtitle: string;
  options: StepUpChoiceOption[];
  value: string | null;
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
