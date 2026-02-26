/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { Button } from '@openloaf/ui/calendar/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@openloaf/ui/calendar/components/ui/dialog'
import type { RecurrenceEditScope } from '@openloaf/ui/calendar/features/recurrence/types'
import { useSmartCalendarContext } from '@openloaf/ui/calendar/hooks/use-smart-calendar-context'

interface RecurrenceEditDialogProps {
	isOpen: boolean
	onClose: () => void
	onConfirm: (scope: RecurrenceEditScope) => void
	operationType: 'edit' | 'delete'
	eventTitle: string
}

export function RecurrenceEditDialog({
	isOpen,
	onClose,
	onConfirm,
	operationType,
	eventTitle,
}: RecurrenceEditDialogProps) {
	const { t } = useSmartCalendarContext((context) => ({ t: context.t }))

	const handleScopeSelect = (scope: RecurrenceEditScope) => {
		onConfirm(scope)
		onClose()
	}

	const isEdit = operationType === 'edit'

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? t('editRecurringEvent') : t('deleteRecurringEvent')}
					</DialogTitle>
					<DialogDescription>
						"{eventTitle}"{' '}
						{isEdit
							? t('editRecurringEventQuestion')
							: t('deleteRecurringEventQuestion')}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<Button
						className="w-full justify-start h-auto p-4"
						onClick={() => handleScopeSelect('this')}
						variant="outline"
					>
						<div className="text-left">
							<div className="font-medium">{t('thisEvent')}</div>
							<div className="text-sm text-muted-foreground">
								{isEdit ? t('onlyChangeThis') : t('onlyDeleteThis')}
							</div>
						</div>
					</Button>

					<Button
						className="w-full justify-start h-auto p-4"
						onClick={() => handleScopeSelect('following')}
						variant="outline"
					>
						<div className="text-left">
							<div className="font-medium">{t('thisAndFollowingEvents')}</div>
							<div className="text-sm text-muted-foreground">
								{isEdit ? t('changeThisAndFuture') : t('deleteThisAndFuture')}
							</div>
						</div>
					</Button>

					<Button
						className="w-full justify-start h-auto p-4"
						onClick={() => handleScopeSelect('all')}
						variant="outline"
					>
						<div className="text-left">
							<div className="font-medium">{t('allEvents')}</div>
							<div className="text-sm text-muted-foreground">
								{isEdit ? t('changeEntireSeries') : t('deleteEntireSeries')}
							</div>
						</div>
					</Button>
				</div>

				<DialogFooter>
					<Button onClick={onClose} variant="outline">
						{t('cancel')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
