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
            "absolute top-0.5 h-7 w-7 rounded-full transition-all duration-200",
            isManual
              ? "left-0.5 bg-blue-500/15 dark:bg-blue-500/20"
              : "left-[calc(100%-1.875rem)] bg-amber-500/15 dark:bg-amber-500/20",
          )}
        />
        <span
          className={cn(
            "relative z-10 inline-flex h-7 w-7 items-center justify-center transition-colors",
            isManual
              ? "text-blue-600 dark:text-blue-300"
              : "text-muted-foreground",
          )}
        >
          <Shield className="h-3.5 w-3.5" />
        </span>
        <span
          className={cn(
            "relative z-10 inline-flex h-7 w-7 items-center justify-center transition-colors",
            !isManual
              ? "text-amber-600 dark:text-amber-300"
              : "text-muted-foreground",
          )}
        >
          <ShieldOff className="h-3.5 w-3.5" />
        </span>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              启用自动批准？
            </AlertDialogTitle>
            <AlertDialogDescription>
              开启后，AI 将自动执行需要审批的操作（如运行命令、修改邮件/日历/项目等），不再逐一请求确认。请确保你信任当前的 AI 操作环境。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
              onClick={() => onChange("auto")}
            >
              确认开启
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
