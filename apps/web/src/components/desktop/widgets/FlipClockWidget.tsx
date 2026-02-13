"use client";

import FlipClock from "@tenas-ai/ui/flip-clock";

interface FlipClockWidgetProps {
  /** Active variant key. */
  variant?: 'hm' | 'hms';
  /** Whether to show seconds (backward compat, variant takes priority). */
  showSeconds?: boolean;
}

/** Render a flip clock widget for the desktop grid. */
export default function FlipClockWidget({ variant, showSeconds = true }: FlipClockWidgetProps) {
  const resolvedShowSeconds = variant ? variant === 'hms' : showSeconds;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="scale-125">
        <FlipClock showSeconds={resolvedShowSeconds} />
      </div>
    </div>
  );
}
