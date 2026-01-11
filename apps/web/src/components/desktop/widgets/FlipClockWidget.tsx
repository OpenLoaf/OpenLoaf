"use client";

import FlipClock from "@/components/ui/flip-clock";

interface FlipClockWidgetProps {
  /** Whether to show seconds. */
  showSeconds?: boolean;
}

/** Render a flip clock widget for the desktop grid. */
export default function FlipClockWidget({ showSeconds = true }: FlipClockWidgetProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="scale-125">
        <FlipClock showSeconds={showSeconds} />
      </div>
    </div>
  );
}
