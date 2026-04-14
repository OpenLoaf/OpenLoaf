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
import { Checkbox } from '@openloaf/ui/checkbox'
import { Label } from '@openloaf/ui/label'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

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
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={t('versionStack.deleteTitle')}
      description={t('versionStack.deleteDescription', { count: versionCount })}
      cancelLabel={t('versionStack.deleteCancel')}
      confirmLabel={t('versionStack.deleteConfirm')}
      variant="destructive"
      onCancel={onCancel}
      onConfirm={() => onConfirm(deleteAll)}
    >
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
    </ConfirmDialog>
  )
}
