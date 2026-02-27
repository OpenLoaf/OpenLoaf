/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type React from 'react'
import { useEffect, useState } from 'react'
import type { CalendarEvent } from '@openloaf/ui/calendar/components/types'
import { Button } from '@openloaf/ui/calendar/components/ui/button'
import { Checkbox } from '@openloaf/ui/calendar/components/ui/checkbox'
import { DatePicker } from '@openloaf/ui/calendar/components/ui/date-picker'
import { DialogFooter } from '@openloaf/ui/calendar/components/ui/dialog'
import { Input } from '@openloaf/ui/calendar/components/ui/input'
import { Label } from '@openloaf/ui/calendar/components/ui/label'
import { ScrollArea } from '@openloaf/ui/calendar/components/ui/scroll-area'
import { TimePicker } from '@openloaf/ui/calendar/components/ui/time-picker'
import { Switch } from '@openloaf/ui/switch'
import { isBusinessDay } from '@openloaf/ui/calendar/features/calendar/utils/business-hours'
import {
	buildDateTime,
	buildEndDateTime,
	getTimeConstraints,
} from '@openloaf/ui/calendar/features/calendar/utils/event-form-utils'
import { RecurrenceEditDialog } from '@openloaf/ui/calendar/features/recurrence/components/recurrence-edit-dialog'
import { RecurrenceEditor } from '@openloaf/ui/calendar/features/recurrence/components/recurrence-editor/recurrence-editor'
import { useRecurringEventActions } from '@openloaf/ui/calendar/features/recurrence/hooks/useRecurringEventActions'
import type { RRuleOptions } from '@openloaf/ui/calendar/features/recurrence/types'
import { isRecurringEvent } from '@openloaf/ui/calendar/features/recurrence/utils/recurrence-handler'
import { useSmartCalendarContext } from '@openloaf/ui/calendar/hooks/use-smart-calendar-context'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@openloaf/ui/calendar/lib/utils'

const COLOR_OPTIONS = [
	{
		value: `bg-blue-100 text-blue-800`,
		label: 'Blue',
	},
	{
		value: `bg-green-100 text-green-800`,
		label: 'Green',
	},
	{
		value: `bg-purple-100 text-purple-800`,
		label: 'Purple',
	},
	{
		value: `bg-red-100 text-red-800`,
		label: 'Red',
	},
	{
		value: `bg-yellow-100 text-yellow-800`,
		label: 'Yellow',
	},
	{
		value: `bg-pink-100 text-pink-800`,
		label: 'Pink',
	},
	{
		value: `bg-indigo-100 text-indigo-800`,
		label: 'Indigo',
	},
	{
		value: `bg-amber-100 text-amber-800`,
		label: 'Amber',
	},
	{
		value: `bg-emerald-100 text-emerald-800`,
		label: 'Emerald',
	},
	{
		value: `bg-sky-100 text-sky-800`,
		label: 'Sky',
	},
	{
		value: `bg-violet-100 text-violet-800`,
		label: 'Violet',
	},
	{
		value: `bg-rose-100 text-rose-800`,
		label: 'Rose',
	},
	{
		value: `bg-teal-100 text-teal-800`,
		label: 'Teal',
	},
	{
		value: `bg-orange-100 text-orange-800`,
		label: 'Orange',
	},
]

/** Extract background/text class tokens from color option. */
const extractColorTokens = (value: string) => {
	const tokens = value.split(' ')
	const bg = tokens.find((token) => token.startsWith('bg-'))
	const text = tokens.find((token) => token.startsWith('text-'))
	return { backgroundClass: bg, textClass: text }
}

export interface EventFormProps {
	open?: boolean
	selectedEvent?: CalendarEvent | null
	onAdd?: (event: CalendarEvent) => void
	onUpdate?: (event: CalendarEvent) => void
	onDelete?: (event: CalendarEvent) => void
	onClose: () => void
	/** Event type for special rendering (event/reminder). */
	eventType?: 'event' | 'reminder'
	/** Whether reminder time range is enabled. */
	reminderTimeEnabled?: boolean
	/** Handle reminder time range toggle. */
	onReminderTimeEnabledChange?: (enabled: boolean) => void
}

export const EventForm: React.FC<EventFormProps> = ({
	selectedEvent,
	onClose,
	onUpdate,
	onDelete,
	onAdd,
	eventType = 'event',
	reminderTimeEnabled,
	onReminderTimeEnabledChange,
}) => {
	const {
		dialogState,
		openEditDialog,
		openDeleteDialog,
		closeDialog,
		handleConfirm,
	} = useRecurringEventActions(onClose)

	const { findParentRecurringEvent, t, businessHours, timeFormat } =
		useSmartCalendarContext((context) => ({
			findParentRecurringEvent: context.findParentRecurringEvent,
			t: context.t,
			businessHours: context.businessHours,
			timeFormat: context.timeFormat,
		}))

	const isReminder = eventType === 'reminder'
	const reminderTimeEnabledSafe = reminderTimeEnabled ?? false
	const start = selectedEvent?.start ?? dayjs()
	const end = selectedEvent?.end ?? dayjs().add(1, 'hour')

	// Find parent event if this is a recurring event instance
	const parentEvent = selectedEvent
		? findParentRecurringEvent(selectedEvent)
		: null

	// Form state
	const [startDate, setStartDate] = useState(start.toDate())
	const [endDate, setEndDate] = useState(end.toDate())
	const [isAllDay, setIsAllDay] = useState(selectedEvent?.allDay || false)
	const [selectedColor, setSelectedColor] = useState(
		selectedEvent?.color || COLOR_OPTIONS[0].value
	)

	// Time state
	const [startTime, setStartTime] = useState(start.format('HH:mm'))
	const [endTime, setEndTime] = useState(end.format('HH:mm'))

	// Initialize form values from selected event or defaults
	const [formValues, setFormValues] = useState({
		title: selectedEvent?.title || '',
		description: selectedEvent?.description || '',
		location: selectedEvent?.location || '',
	})

	// Recurrence state - pull RRULE from parent if this is an instance
	const [rrule, setRrule] = useState<RRuleOptions | null>(() => {
		const eventRrule = selectedEvent?.rrule || parentEvent?.rrule
		return eventRrule || null
	})

	// Create wrapper functions to fix TypeScript errors with DatePicker
	const handleStartDateChange = (date: Date | undefined) => {
		if (!date) return
		setStartDate(date)
		if (date && dayjs(date).isAfter(dayjs(endDate))) {
			setEndDate(date)
		}
		if (date && isReminder && reminderTimeEnabledSafe === false) {
			setEndDate(date)
		}
	}

	const handleEndDateChange = (date: Date | undefined) => {
		if (!date) return
		setEndDate(date)
		if (date && dayjs(date).isBefore(dayjs(startDate))) {
			setStartDate(date)
		}
	}

	// Time validation handlers - only validate when dates are the same
	const handleStartTimeChange = (time: string) => {
		setStartTime(time)
		// Only validate if same day
		if (dayjs(startDate).isSame(dayjs(endDate), 'day') && time > endTime) {
			setEndTime(time)
		}
	}

	const handleEndTimeChange = (time: string) => {
		setEndTime(time)
		// Only validate if same day
		if (dayjs(startDate).isSame(dayjs(endDate), 'day') && time < startTime) {
			setStartTime(time)
		}
	}

	// Update form values when input changes
	const handleInputChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
	) => {
		const { name, value } = e.target
		setFormValues((prev) => ({ ...prev, [name]: value }))
	}

	useEffect(() => {
		// Reset end time when all day is toggled to on
		if (isAllDay) {
			setEndTime('23:59')
		}
	}, [isAllDay])

	useEffect(() => {
		if (!isReminder) return
		if (reminderTimeEnabledSafe === false) {
			setIsAllDay(true)
			setEndDate(startDate)
		} else if (reminderTimeEnabledSafe === true) {
			setIsAllDay(false)
		}
	}, [isReminder, reminderTimeEnabledSafe, startDate])

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()

		const startDateTime = buildDateTime(startDate, startTime, isAllDay)
		const endDateTime = buildEndDateTime(endDate, endTime, isAllDay)

		const eventData: CalendarEvent = {
			id: selectedEvent?.id || dayjs().format('YYYYMMDDHHmmss'),
			title: formValues.title,
			start: startDateTime,
			end: endDateTime,
			resourceId: selectedEvent?.resourceId,
			description: formValues.description,
			location: formValues.location,
			allDay: isAllDay,
			color: extractColorTokens(selectedColor).textClass ?? selectedColor,
			backgroundColor:
				extractColorTokens(selectedColor).backgroundClass ?? selectedColor,
			rrule: rrule || undefined,
		}

		if (selectedEvent?.id && isRecurringEvent(selectedEvent)) {
			openEditDialog(selectedEvent, {
				title: formValues.title,
				start: startDateTime,
				end: endDateTime,
				description: formValues.description,
				location: formValues.location,
				allDay: isAllDay,
				color: selectedColor,
				rrule: rrule || undefined,
			})
			return
		}

		if (selectedEvent?.id) {
			onUpdate?.(eventData)
		} else {
			onAdd?.(eventData)
		}
		onClose()
	}

	const handleDelete = () => {
		if (selectedEvent?.id) {
			// Check if this is a recurring event
			if (isRecurringEvent(selectedEvent)) {
				// Show recurring event delete dialog
				openDeleteDialog(selectedEvent)
				return // Don't close the form yet, let the dialog handle it
			}
			onDelete?.(selectedEvent)
			onClose()
		}
	}

	const handleRRuleChange = (newRRule: RRuleOptions | null) => {
		if (!newRRule) {
			setRrule(null)
			return
		}
		const startDateTime = buildDateTime(startDate, startTime, isAllDay)
		setRrule({ ...newRRule, dtstart: startDateTime.toDate() })
	}

	const disabledDateMatcher = businessHours
		? (date: Date) => !isBusinessDay(dayjs(date), businessHours)
		: undefined

	const startConstraints = getTimeConstraints(startDate, businessHours)
	const endConstraints = getTimeConstraints(endDate, businessHours)

	return (
		<>
			<form className="flex flex-col flex-1 min-h-0" onSubmit={handleSubmit}>
				<ScrollArea className="flex-1 min-h-0">
					<div className="space-y-4 px-5 py-4">
						{/* Title & Description */}
						<div className="space-y-3">
							<Input
								className="h-9 text-sm border-0 border-b rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary font-medium"
								id="title"
								name="title"
								onChange={handleInputChange}
								placeholder={t('eventTitlePlaceholder')}
								required
								value={formValues.title}
							/>
							<Input
								className="h-8 text-sm border-0 border-b rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary text-muted-foreground"
								id="description"
								name="description"
								onChange={handleInputChange}
								placeholder={t('eventDescriptionPlaceholder')}
								value={formValues.description}
							/>
						</div>

						<div className="h-px bg-border" />

						{!isReminder && (
							<div className="flex items-center space-x-2">
								<Checkbox
									checked={isAllDay}
									id="allDay"
									onCheckedChange={(checked) => setIsAllDay(checked === true)}
								/>
								<Label className="text-sm" htmlFor="allDay">
									{t('allDay')}
								</Label>
							</div>
						)}

						{isReminder && (
							<div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
								<div className="flex flex-col">
									<span className="text-xs font-medium">时间范围</span>
									<span className="text-[11px] text-muted-foreground">
										开启后可设置开始与结束时间
									</span>
								</div>
								<Switch
									checked={reminderTimeEnabledSafe === true}
									id="reminderTimeEnabled"
									onCheckedChange={(checked) =>
										onReminderTimeEnabledChange?.(checked === true)
									}
								/>
							</div>
						)}

						{isReminder && reminderTimeEnabledSafe === false ? (
							<div>
								<Label className="text-xs text-muted-foreground mb-1.5 block">日期</Label>
								<DatePicker
									closeOnSelect
									date={startDate}
									disabled={disabledDateMatcher}
									onChange={handleStartDateChange}
								/>
							</div>
						) : (
							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label className="text-xs text-muted-foreground mb-1.5 block">{t('startDate')}</Label>
									<DatePicker
										closeOnSelect
										date={startDate}
										disabled={disabledDateMatcher}
										onChange={handleStartDateChange}
									/>
								</div>
								<div>
									<Label className="text-xs text-muted-foreground mb-1.5 block">{t('endDate')}</Label>
									<DatePicker
										closeOnSelect
										date={endDate}
										disabled={disabledDateMatcher}
										onChange={handleEndDateChange}
									/>
								</div>
							</div>
						)}

						{!(isReminder && reminderTimeEnabledSafe === false) && !isAllDay && (
							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label className="text-xs text-muted-foreground mb-1.5 block">{t('startTime')}</Label>
									<TimePicker
										className="h-8 text-sm"
										maxTime={startConstraints.max}
										minTime={startConstraints.min}
										name="start-time"
										onChange={handleStartTimeChange}
										timeFormat={timeFormat}
										value={startTime}
									/>
								</div>
								<div>
									<Label className="text-xs text-muted-foreground mb-1.5 block">{t('endTime')}</Label>
									<TimePicker
										className="h-8 text-sm"
										maxTime={endConstraints.max}
										minTime={endConstraints.min}
										name="end-time"
										onChange={handleEndTimeChange}
										timeFormat={timeFormat}
										value={endTime}
									/>
								</div>
							</div>
						)}

						<div className="h-px bg-border" />

						{!isReminder && (
							<div className="space-y-2">
								<Label className="text-xs text-muted-foreground">{t('color')}</Label>
								<div className="flex flex-wrap gap-2">
									{COLOR_OPTIONS.map((color) => (
										<button
											aria-label={color.label}
											className={cn(
												'h-6 w-6 rounded-full transition-all',
												color.value,
												selectedColor === color.value
													? 'ring-2 ring-primary ring-offset-2'
													: 'hover:scale-110'
											)}
											key={color.value}
											onClick={() => setSelectedColor(color.value)}
											type="button"
										/>
									))}
								</div>
							</div>
						)}

						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground" htmlFor="location">
								{t('location')}
							</Label>
							<Input
								className="h-8 text-sm"
								id="location"
								name="location"
								onChange={handleInputChange}
								placeholder={t('eventLocationPlaceholder')}
								value={formValues.location}
							/>
						</div>

						{/* Recurrence Section */}
						{!isReminder && (
							<>
								<div className="h-px bg-border" />
								<RecurrenceEditor onChange={handleRRuleChange} value={rrule} />
							</>
						)}
					</div>
				</ScrollArea>

				<DialogFooter className="shrink-0 flex items-center gap-2 border-t px-5 py-3">
					{selectedEvent?.id && (
						<Button
							className="mr-auto"
							onClick={handleDelete}
							size="sm"
							type="button"
							variant="ghost"
						>
							<span className="text-destructive">{t('delete')}</span>
						</Button>
					)}
					<div className="flex gap-2 ml-auto">
						<Button
							onClick={onClose}
							size="sm"
							type="button"
							variant="ghost"
						>
							{t('cancel')}
						</Button>
						<Button size="sm" type="submit">
							{selectedEvent?.id ? t('update') : t('create')}
						</Button>
					</div>
				</DialogFooter>
			</form>

			{/* Recurring Event Edit Dialog */}
			<RecurrenceEditDialog
				eventTitle={dialogState.event?.title || ''}
				isOpen={dialogState.isOpen}
				onClose={closeDialog}
				onConfirm={handleConfirm}
				operationType={dialogState.operationType}
			/>
		</>
	)
}
