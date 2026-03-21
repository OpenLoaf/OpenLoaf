/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type PillSelectOption = {
  value: string
  label: string
}

export type PillSelectProps = {
  options: PillSelectOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Full width mode (e.g. for voice selector with label). */
  fullWidth?: boolean
  className?: string
}

export function PillSelect({
  options,
  value,
  onChange,
  disabled,
  fullWidth,
  className,
}: PillSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value

  return (
    <div className={['relative', fullWidth ? 'w-full' : ''].join(' ')} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className={[
          'inline-flex items-center gap-1 rounded-3xl border border-border bg-transparent px-2.5 py-1 text-[11px] text-foreground outline-none transition-colors duration-150',
          disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'hover:bg-foreground/5',
          fullWidth ? 'w-full justify-between' : '',
          className ?? '',
        ].join(' ')}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span className="truncate font-medium">{selectedLabel}</span>
        <ChevronDown
          size={10}
          className={[
            'shrink-0 text-muted-foreground transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full mt-1 z-10 flex flex-col rounded-2xl border border-border bg-card py-0.5 shadow-lg min-w-[100px] max-h-[200px] overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={[
                'px-3 py-1.5 text-[11px] text-left transition-colors hover:bg-foreground/5',
                value === o.value
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              ].join(' ')}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
