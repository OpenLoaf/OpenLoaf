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

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@openloaf/ui/alert-dialog'
import { Checkbox } from '@openloaf/ui/checkbox'
import { Label } from '@openloaf/ui/label'

interface VersionStackDeleteDialogProps {
  open: boolean
  versionCount: number
  onConfirm: (deleteAll: boolean) => void
  onCancel: () => void
}

export function VersionStackDeleteDialog({
  open,
  versionCount,
  onConfirm,
  onCancel,
}: VersionStackDeleteDialogProps) {
  const { t } = useTranslation('board')
  const [deleteAll, setDeleteAll] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('versionStack.deleteTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('versionStack.deleteDescription', { count: versionCount })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="delete-all-versions"
            checked={deleteAll}
            onCheckedChange={(checked) => setDeleteAll(checked === true)}
          />
          <Label htmlFor="delete-all-versions" className="cursor-pointer text-sm">
            {t('versionStack.deleteAll')}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t('versionStack.deleteCancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90 rounded-3xl"
            onClick={() => onConfirm(deleteAll)}
          >
            {t('versionStack.deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
