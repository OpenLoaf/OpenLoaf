import type { DragEndEvent } from '@dnd-kit/core'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import type { CalendarEvent } from '../types'

export const getUpdatedEvent = (
	event: DragEndEvent,
	activeEvent: CalendarEvent | null
) => {
	const { active, over } = event

	if (!active || !over || !activeEvent) {
		return null
	}

	const overData = over.data.current
	if (!overData) {
		return null
	}
	const isTimeCell = overData.type === 'time-cell'
	const { resourceId, allDay } = overData
	let newStart

	if (isTimeCell) {
		if (!overData.date) return null
		const { date, hour = 0, minute = 0 } = overData

		// Create new start time based on the drop target
		newStart = dayjs(date).hour(hour).minute(minute)
	} else {
		if (!overData.date) return null
		const { date } = overData

		newStart = dayjs(date)
		if (!activeEvent.allDay) {
			// 逻辑：非全天事件拖拽到日期格时保留原始时间。
			newStart = newStart
				.hour(activeEvent.start.hour())
				.minute(activeEvent.start.minute())
				.second(activeEvent.start.second())
				.millisecond(activeEvent.start.millisecond())
		}
	}

	const eventDuration = activeEvent.end.diff(activeEvent.start, 'second')

	// Create new end time by adding the original duration
	let newEnd = newStart.add(eventDuration, 'second')

	const updatesAllDay = isTimeCell ? false : allDay === true ? true : activeEvent.allDay
	if (updatesAllDay && newEnd.isSame(newEnd.startOf('day'))) {
		// If the new end time is at midnight, set it to 24 hours of partial day
		newEnd = newEnd.subtract(1, 'day').endOf('day')
	}

	// Update the event with new times and resource if changed
	const updates = {
		start: newStart,
		end: newEnd,
		resourceId,
		// 逻辑：非时间格拖拽默认保持原来的全天状态，仅当目标格标记为全天时才切换为全天。
		allDay: updatesAllDay,
	}
	return { activeEvent, updates }
}
