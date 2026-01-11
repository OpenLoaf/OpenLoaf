"use client";

import * as React from "react";
import { FlipClock } from "@/components/ui/flip-countdown";

export interface FlipClockWidgetProps {
  /** Whether to show seconds. */
  showSeconds?: boolean;
  /** Whether to render 24-hour clock. */
  use24Hours?: boolean;
}

/** Render a flip clock widget for the desktop grid. */
export default function FlipClockWidget({
  showSeconds = true,
  use24Hours = true,
}: FlipClockWidgetProps) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    // 让刷新尽量对齐到整秒边界，减少累计误差导致的“跳秒”。
    let timeoutId: number | null = null;

    const tick = () => {
      const current = new Date();
      setNow(current);
      timeoutId = window.setTimeout(tick, 1000 - current.getMilliseconds());
    };

    tick();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <FlipClock date={now} showSeconds={showSeconds} use24Hours={use24Hours} />
    </div>
  );
}

