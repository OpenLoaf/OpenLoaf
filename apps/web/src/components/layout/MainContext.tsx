/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import * as React from "react"
import { useAppView } from "@/hooks/use-app-view"
import { cn } from "@/lib/utils"
import { TabLayout } from "./TabLayout"

export const MainContent: React.FC<{ className?: string }> = ({ className }) => {
  const initialized = useAppView((s) => s.initialized)

  if (!initialized) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-muted-foreground",
          className,
        )}
      >
        Loading...
      </div>
    )
  }

  return (
    <div className={cn("relative h-full w-full min-w-0", className)}>
      <TabLayout />
    </div>
  )
}
