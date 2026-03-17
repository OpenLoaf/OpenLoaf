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

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient, trpc } from '@/utils/trpc'
import { useStackPanelSlot } from '@/hooks/use-stack-panel-slot'
import { getCachedAccessToken } from '@/lib/saas-auth'
import { toast } from 'sonner'
import { Check, Download, Languages, Loader2, RefreshCw } from 'lucide-react'
import { exportSkillAsZip } from './skill-utils'

type SkillTranslateSlotProps = {
  skillFolderPath: string
}

/** Slot injection component — renders a translate button into StackHeader. */
function SkillTranslateSlot({ skillFolderPath }: SkillTranslateSlotProps) {
  const { t, i18n } = useTranslation('settings')
  const slotCtx = useStackPanelSlot()
  const currentLanguage = i18n.language

  const statusQuery = useQuery(
    trpc.settings.getSkillTranslationStatus.queryOptions({
      skillFolderPath,
      targetLanguage: currentLanguage,
    }),
  )

  const translateMutation = useMutation(
    trpc.settings.translateSkill.mutationOptions({
      onSuccess: (data) => {
        if (data.ok) {
          if (data.translatedFiles === 0 && data.skippedFiles > 0) {
            toast.info(t('skills.translate.upToDate'))
          } else {
            toast.success(
              t('skills.translate.success', {
                translated: data.translatedFiles,
                skipped: data.skippedFiles,
              }),
            )
          }
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getSkillTranslationStatus.queryOptions({
              skillFolderPath,
              targetLanguage: currentLanguage,
            }).queryKey,
          })
          queryClient.invalidateQueries({
            queryKey: trpc.settings.getSkills.queryOptions().queryKey,
          })
          // Refresh the file tree and file preview in the stack panel
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey
              if (!Array.isArray(key) || key.length === 0) return false
              const first = key[0]
              return Array.isArray(first) && first[0] === 'fs'
            },
          })
        } else {
          toast.error(data.error ?? t('skills.translate.failed'))
        }
      },
      onError: (error) => {
        toast.error(error.message ?? t('skills.translate.failed'))
      },
    }),
  )

  const handleTranslate = useCallback(() => {
    translateMutation.mutate({
      skillFolderPath,
      targetLanguage: currentLanguage,
      saasAccessToken: getCachedAccessToken() ?? undefined,
    })
  }, [skillFolderPath, currentLanguage, translateMutation])

  const status = statusQuery.data?.status ?? 'not-translated'
  const isTranslating = translateMutation.isPending

  const [isExporting, setIsExporting] = useState(false)
  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const ok = await exportSkillAsZip(skillFolderPath)
      if (!ok) toast.error(t('skills.export.failed', { defaultValue: '导出失败' }))
    } catch (err: any) {
      toast.error(err?.message ?? t('skills.export.failed', { defaultValue: '导出失败' }))
    } finally {
      setIsExporting(false)
    }
  }, [skillFolderPath, t])
  // NOTE: isExporting here is kept to disable the header button during export,
  // while the loading toast is managed inside exportSkillAsZip.

  useEffect(() => {
    if (!slotCtx) return

    let translateIcon: React.ReactElement
    let translateLabel: string
    let translateDisabled = false
    let translateClassName =
      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors'

    if (isTranslating) {
      translateIcon = React.createElement(Loader2, {
        className: 'h-3.5 w-3.5 animate-spin',
      })
      translateLabel = t('skills.translate.buttonTranslating')
      translateDisabled = true
      translateClassName += ' text-muted-foreground cursor-not-allowed'
    } else if (status === 'translated') {
      translateIcon = React.createElement(Check, {
        className: 'h-3.5 w-3.5 text-green-600 dark:text-green-400',
      })
      translateLabel = t('skills.translate.buttonTranslated')
      translateClassName += ' text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
    } else if (status === 'needs-update') {
      translateIcon = React.createElement(RefreshCw, {
        className: 'h-3.5 w-3.5 text-amber-600 dark:text-amber-400',
      })
      translateLabel = t('skills.translate.buttonRetranslate')
      translateClassName += ' text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
    } else {
      translateIcon = React.createElement(Languages, { className: 'h-3.5 w-3.5' })
      translateLabel = t('skills.translate.buttonTranslate')
      translateClassName += ' text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    }

    const exportLabel = t('skills.exportSkill', { defaultValue: '导出' })
    const exportClassName =
      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors text-muted-foreground hover:bg-muted/60 hover:text-foreground'

    const exportButton = React.createElement(
      'button',
      {
        type: 'button',
        className: exportClassName,
        title: exportLabel,
        'aria-label': exportLabel,
        disabled: isExporting,
        onClick: handleExport,
      },
      isExporting
        ? React.createElement(Loader2, { className: 'h-3.5 w-3.5 animate-spin' })
        : React.createElement(Download, { className: 'h-3.5 w-3.5' }),
    )

    const translateButton = React.createElement(
      'button',
      {
        type: 'button',
        className: translateClassName,
        title: translateLabel,
        'aria-label': translateLabel,
        disabled: translateDisabled,
        onClick: handleTranslate,
      },
      translateIcon,
      React.createElement('span', { className: 'hidden sm:inline' }, translateLabel),
    )

    slotCtx.setSlot({
      rightSlotBeforeClose: React.createElement(
        React.Fragment,
        null,
        exportButton,
        translateButton,
      ),
    })

    return () => slotCtx.setSlot(null)
  }, [slotCtx, status, isTranslating, isExporting, handleTranslate, handleExport, t])

  return null
}

export default SkillTranslateSlot
