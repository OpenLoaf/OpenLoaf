/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from "react"
import { cn } from "@/lib/utils"

/** Traffic light state for macOS-style window chrome. */
export type TrafficLightsState = "idle" | "running" | "success" | "error"

/** Props for TrafficLights. */
export type TrafficLightsProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Current light state. */
  state?: TrafficLightsState
}

/** macOS-style traffic lights for tool headers. */
export function TrafficLights({
  state = "idle",
  className,
  ...props
}: TrafficLightsProps) {
  const colors = {
    idle: { r: "bg-red-400", y: "bg-yellow-400", g: "bg-green-400" },
    running: {
      r: "bg-red-400",
      y: "bg-yellow-400",
      g: "bg-green-400 animate-pulse",
    },
    success: { r: "bg-red-400", y: "bg-yellow-400", g: "bg-green-500" },
    error: { r: "bg-red-500", y: "bg-yellow-400", g: "bg-neutral-400" },
  }
  const c = colors[state]
  return (
    <div className={cn("flex items-center gap-1.5", className)} {...props}>
      <span className={cn("size-2.5 rounded-full", c.r)} />
      <span className={cn("size-2.5 rounded-full", c.y)} />
      <span className={cn("size-2.5 rounded-full", c.g)} />
    </div>
  )
}
