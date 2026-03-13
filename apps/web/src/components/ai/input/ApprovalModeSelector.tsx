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

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Shield, ShieldOff } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openloaf/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip"

export type ApprovalMode = "manual" | "auto"

interface ApprovalModeSelectorProps {
  value: ApprovalMode
  onChange: (value: ApprovalMode) => void
  disabled?: boolean
  className?: string
}

/** Toggle switch for tool approval mode (manual / auto). */
export default function ApprovalModeSelector({
  value,
  onChange,
  disabled,
  className,
}: ApprovalModeSelectorProps) {
  const { t } = useTranslation('ai')
  const isManual = value === "manual"
  const [confirmOpen, setConfirmOpen] = useState(false)

  const toggle = () => {
    if (disabled) return
    if (isManual) {
      // Switching to auto: show confirmation dialog
      setConfirmOpen(true)
    } else {
      onChange("manual")
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative inline-flex h-8 cursor-pointer items-center rounded-full border border-border/60 bg-muted/60 p-0.5",
              disabled && "pointer-events-none opacity-50",
              className,
            )}
            onClick={toggle}
            role="switch"
            aria-checked={!isManual}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                toggle()
              }
            }}
          >
            {/* Sliding indicator */}
            <span
              className={cn(
                "absolute top-[3px] bottom-[3px] w-[26px] rounded-full transition-all duration-200",
                isManual
                  ? "left-[3px] bg-ol-blue/15"
                  : "right-[3px] left-auto bg-ol-amber/15",
              )}
            />
            <span
              className={cn(
                "relative z-10 inline-flex h-[26px] w-[26px] items-center justify-center transition-colors",
                isManual
                  ? "text-ol-blue"
                  : "text-muted-foreground",
              )}
            >
              <Shield className="h-3.5 w-3.5" />
            </span>
            <span
              className={cn(
                "relative z-10 inline-flex h-[26px] w-[26px] items-center justify-center transition-colors",
                !isManual
                  ? "text-ol-amber"
                  : "text-muted-foreground",
              )}
            >
              <ShieldOff className="h-3.5 w-3.5" />
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isManual ? t('approval.manualMode') : t('approval.autoMode')}
        </TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('approval.enableDialog')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('approval.enableDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('approval.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ol-amber text-white hover:bg-ol-amber/90"
              onClick={() => onChange("auto")}
            >
              {t('approval.confirmEnable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
