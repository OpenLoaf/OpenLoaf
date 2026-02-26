/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import FlipClock from "@openloaf/ui/flip-clock";

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
