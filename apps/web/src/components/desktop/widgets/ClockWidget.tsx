"use client";

import * as React from "react";

/** Render a simple live clock widget (MVP). */
export default function ClockWidget() {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

