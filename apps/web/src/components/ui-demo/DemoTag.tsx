import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'info' | 'success' | 'warning' | 'danger'

const variantClass: Record<Variant, string> = {
  default: 'bg-muted text-muted-foreground',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
}

export type DemoTagProps = React.ComponentProps<'span'> & {
  variant?: Variant
}

export function DemoTag({ variant = 'default', className, ...props }: DemoTagProps) {
  return (
    <span
      data-testid="demo-tag"
      data-variant={variant}
      className={cn(
        'inline-flex items-center rounded-sm border border-transparent px-2 py-0.5 font-mono text-xs uppercase tracking-wide',
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
}
