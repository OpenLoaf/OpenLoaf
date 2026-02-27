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

import * as React from "react";

/** Render a simple live clock widget (MVP). */
export default function ClockWidget({ variant }: { variant?: 'hm' | 'hms' }) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const showSeconds = variant === 'hms';
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
  });
  const date = now.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex h-full w-full flex-col justify-between">
      <div className="text-sm text-muted-foreground">{date}</div>
      <div className="text-4xl font-semibold tabular-nums tracking-tight">
        {time}
      </div>
    </div>
  );
}

