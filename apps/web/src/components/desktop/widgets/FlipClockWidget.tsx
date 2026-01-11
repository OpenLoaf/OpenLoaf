"use client";

import FlipClock from "@/components/ui/flip-clock";

/** Render a flip clock widget for the desktop grid. */
export default function FlipClockWidget() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="scale-125">
        <FlipClock />
      </div>
    </div>
  );
}
