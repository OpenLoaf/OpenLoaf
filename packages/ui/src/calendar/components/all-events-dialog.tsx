import type React from 'react'
import { useImperativeHandle, useState } from 'react'
import type { CalendarEvent } from '@tenas-ai/ui/calendar/components/types'
import { DraggableEvent } from '@tenas-ai/ui/calendar/components/draggable-event/draggable-event'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@tenas-ai/ui/calendar/components/ui/dialog'
import { useSmartCalendarContext } from '@tenas-ai/ui/calendar/hooks/use-smart-calendar-context'
import type dayjs from '@tenas-ai/ui/calendar/lib/configs/dayjs-config'
import { formatFullDate } from '@tenas-ai/ui/calendar/lib/utils/date-utils'
export interface SelectedDayEvents {
	day: dayjs.Dayjs
	events: CalendarEvent[]
}

interface AllEventDialogProps {
	ref: React.Ref<{
		open: () => void
		close: () => void
		setSelectedDayEvents: (dayEvents: SelectedDayEvents) => void
	}>
}

export const AllEventDialog: React.FC<AllEventDialogProps> = ({ ref }) => {
	const [dialogOpen, setDialogOpen] = useState(false)
	const [selectedDayEvents, setSelectedDayEvents] =
		useState<SelectedDayEvents | null>(null)
	const { currentDate, firstDayOfWeek } = useSmartCalendarContext((state) => ({
		currentDate: state.currentDate,
		firstDayOfWeek: state.firstDayOfWeek,
	}))

	useImperativeHandle(ref, () => ({
		open: () => setDialogOpen(true),
		close: () => setDialogOpen(false),
		setSelectedDayEvents: (dayEvents: SelectedDayEvents) =>
			setSelectedDayEvents(dayEvents),
	}))

	// Get start date for the current month view based on firstDayOfWeek
	const firstDayOfMonth = currentDate.startOf('month')

	// Calculate the first day of the calendar grid correctly
	// Find the first day of week (e.g. Sunday or Monday) that comes before or on the first day of the month
	let adjustedFirstDayOfCalendar = firstDayOfMonth.clone()
	while (adjustedFirstDayOfCalendar.day() !== firstDayOfWeek) {
		adjustedFirstDayOfCalendar = adjustedFirstDayOfCalendar.subtract(1, 'day')
	}

	return (
		<Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
			<DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{selectedDayEvents?.day
							? formatFullDate(selectedDayEvents.day, currentDate?.locale())
							: null}
					</DialogTitle>
				</DialogHeader>
				<div className="mt-4 space-y-3">
					{selectedDayEvents?.events.map((event) => {
						return (
							<DraggableEvent
								className="relative my-1 h-[30px]" // Use event ID for unique identification
								elementId={`all-events-dialog-event-$${event.id}`}
								event={event}
								key={event.id}
							/>
						)
					})}
				</div>
			</DialogContent>
		</Dialog>
	)
}
