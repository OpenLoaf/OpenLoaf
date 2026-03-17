/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const WIDTH_CLASSES = {
  full: 'w-full',
  compact: 'max-w-lg',
  wide: 'max-w-3xl',
} as const

type ToolCardShellProps = {
  children: ReactNode
  className?: string
  width?: keyof typeof WIDTH_CLASSES
}

export default function ToolCardShell({
  children,
  className,
  width = 'full',
}: ToolCardShellProps) {
  return (
    <div className={cn('mb-2 min-w-0', WIDTH_CLASSES[width], className)}>
      {children}
    </div>
  )
}
