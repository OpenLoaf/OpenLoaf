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

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog"
import { Button } from "@openloaf/ui/button"
import { Checkbox } from "@openloaf/ui/checkbox"
import { Progress } from "@openloaf/ui/progress"
import { Check, Languages, Loader2, X } from "lucide-react"
import { trpcClient } from "@/utils/trpc"

type SkillItem = {
  name: string
  path: string
}

type TranslateTitlesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Skills that need translation (no openloaf.json). */
  skills: SkillItem[]
  /** All skills including already translated ones. */
  allSkills: SkillItem[]
  invalidateSkillQueries: () => void
}

type ItemStatus = "pending" | "translating" | "translated" | "skipped" | "error"

type ProgressItem = {
  name: string
  folderPath: string
  status: ItemStatus
  translatedName?: string
  icon?: string
  error?: string
}

export function TranslateTitlesDialog({
  open,
  onOpenChange,
  skills,
  allSkills,
  invalidateSkillQueries,
}: TranslateTitlesDialogProps) {
  const { t, i18n } = useTranslation("settings")
  const [retranslateAll, setRetranslateAll] = useState(false)
  const [items, setItems] = useState<ProgressItem[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const cancelledRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeSkills = retranslateAll ? allSkills : skills

  // Initialize items when dialog opens or checkbox changes
  useEffect(() => {
    if (open && !isRunning && !isDone) {
      setItems(
        activeSkills.map((s) => ({
          name: s.name,
          folderPath: s.path.replace(/[/\\]SKILL\.md$/i, ""),
          status: "pending" as ItemStatus,
        })),
      )
    }
  }, [open, activeSkills, isRunning, isDone])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      cancelledRef.current = false
      setIsDone(false)
      setIsRunning(false)
      setRetranslateAll(false)
    }
  }, [open])

  // Auto-scroll to current item
  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector("[data-active]")
      active?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [items])

  // Only show items that are not skipped or errored (visible list)
  const errorItem = items.find((i) => i.status === "error")
  const visibleItems = items.filter((i) => i.status !== "skipped" && i.status !== "error")
  const translatedCount = items.filter((i) => i.status === "translated").length
  const skippedCount = items.filter((i) => i.status === "skipped").length
  const errorCount = errorItem ? 1 : 0
  const processedCount = translatedCount + skippedCount + errorCount
  const progress = items.length > 0 ? (processedCount / items.length) * 100 : 0

  const handleStart = useCallback(async () => {
    setIsRunning(true)
    cancelledRef.current = false
    const targetLanguage = i18n.language

    for (let i = 0; i < items.length; i++) {
      if (cancelledRef.current) break

      // Mark current as translating
      setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, status: "translating" } : item)))

      try {
        // If retranslateAll, delete openloaf.json first via resetSkill
        if (retranslateAll) {
          await trpcClient.settings.resetSkill.mutate({
            skillFolderPath: items[i].folderPath,
          })
        }

        const result = await trpcClient.settings.translateSkillTitle.mutate({
          skillFolderPath: items[i].folderPath,
          targetLanguage,
        })

        if (cancelledRef.current) break

        if (!result.ok) {
          // API returned error — stop the entire loop
          setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, status: "error", error: result.error } : item)))
          break
        }

        setItems((prev) =>
          prev.map((item, idx) => {
            if (idx !== i) return item
            if (result.translated) return { ...item, status: "translated", translatedName: result.name, icon: result.icon }
            return { ...item, status: "skipped" }
          }),
        )
      } catch (err) {
        // Network/server error — stop the entire loop
        const message = err instanceof Error ? err.message : String(err)
        setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, status: "error", error: message } : item)))
        break
      }
    }

    setIsRunning(false)
    setIsDone(true)
    invalidateSkillQueries()
  }, [items, retranslateAll, i18n.language, invalidateSkillQueries])

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    setIsRunning(false)
    setIsDone(true)
  }, [])

  const handleClose = useCallback(() => {
    if (isRunning) {
      cancelledRef.current = true
    }
    onOpenChange(false)
  }, [isRunning, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            {t("skills.translateTitles.dialogTitle", { defaultValue: "翻译技能标题" })}
          </DialogTitle>
          <DialogDescription>
            {isDone
              ? errorItem
                ? t("skills.translateTitles.dialogDescError", {
                    translated: translatedCount,
                    defaultValue: translatedCount > 0
                      ? `已翻译 ${translatedCount} 个，因错误中断`
                      : '翻译因错误中断',
                  })
                : t("skills.translateTitles.dialogDescDone", {
                    translated: translatedCount,
                    skipped: skippedCount,
                    defaultValue: `翻译完成：${translatedCount} 个已翻译，${skippedCount} 个已跳过`,
                  })
              : t("skills.translateTitles.dialogDesc", {
                  count: items.length,
                  defaultValue: `将翻译 ${items.length} 个技能的标题和描述`,
                })
            }
          </DialogDescription>
        </DialogHeader>

        {/* Retranslate all checkbox — only before start */}
        {!isRunning && !isDone ? (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={retranslateAll}
              onCheckedChange={(checked) => setRetranslateAll(checked === true)}
            />
            <span className="text-sm text-muted-foreground">
              {t("skills.translateTitles.retranslateAll", { defaultValue: "重新翻译全部技能（覆盖已有翻译）" })}
            </span>
          </label>
        ) : null}

        {/* Progress bar */}
        {isRunning || isDone ? (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {processedCount} / {items.length}
              </span>
              <span className="flex items-center gap-3">
                {translatedCount > 0 ? (
                  <span className="text-foreground">
                    {t("skills.translateTitles.translated", { count: translatedCount, defaultValue: `${translatedCount} 已翻译` })}
                  </span>
                ) : null}
                {skippedCount > 0 ? (
                  <span>
                    {t("skills.translateTitles.skipped", { count: skippedCount, defaultValue: `${skippedCount} 跳过` })}
                  </span>
                ) : null}
                {errorCount > 0 ? (
                  <span className="text-destructive">
                    {t("skills.translateTitles.errors", { count: errorCount, defaultValue: `${errorCount} 失败` })}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        ) : null}

        {/* Error message or item list */}
        {errorItem ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-destructive">{errorItem.error}</p>
            {processedCount > 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("skills.translateTitles.stoppedAt", {
                  processed: processedCount,
                  total: items.length,
                  defaultValue: `已处理 ${processedCount}/${items.length}，因错误中断`,
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <div ref={scrollRef} className="max-h-64 overflow-y-auto rounded-3xl border bg-muted/20 p-1">
            {visibleItems.length === 0 && isDone ? (
              <div className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                {t("skills.translateTitles.allSkipped", { defaultValue: "所有技能标题已是最新，无需翻译" })}
              </div>
            ) : visibleItems.length === 0 && !isRunning && !isDone ? (
              <div className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                {t("skills.translateTitles.noPending", { defaultValue: "没有需要翻译的技能，勾选上方选项可重新翻译全部" })}
              </div>
            ) : (
              visibleItems.map((item) => (
                <div
                  key={item.folderPath}
                  data-active={item.status === "translating" ? "" : undefined}
                  className={`flex items-center gap-2 rounded-3xl px-2.5 py-1.5 text-sm ${
                    item.status === "translating" ? "bg-secondary/50" : ""
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {item.status === "translating" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                    ) : item.status === "translated" ? (
                      <Check className="h-3.5 w-3.5 text-foreground" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
                    )}
                  </span>
                  {item.icon ? <span className="text-sm leading-none shrink-0">{item.icon}</span> : null}
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      item.status === "translating" || item.status === "translated"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.translatedName ?? item.name}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {!isRunning && !isDone ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                {t("skills.translateTitles.cancel", { defaultValue: "取消" })}
              </Button>
              <Button
                autoFocus
                onClick={() => void handleStart()}
                className="bg-secondary text-secondary-foreground hover:bg-accent"
                disabled={items.length === 0}
              >
                <Languages className="mr-1.5 h-3.5 w-3.5" />
                {t("skills.translateTitles.start", { defaultValue: "开始翻译" })}
              </Button>
            </>
          ) : isRunning ? (
            <Button variant="ghost" onClick={handleCancel}>
              {t("skills.translateTitles.stop", { defaultValue: "停止" })}
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose}>
              {t("skills.translateTitles.close", { defaultValue: "关闭" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
