/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { useMemo } from 'react'
import { useSmartCalendarContext } from '@openloaf/ui/calendar/hooks/use-smart-calendar-context'
import type { CalendarEvent } from '@openloaf/ui/calendar/components/types'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { getPositionedEvents } from '@openloaf/ui/calendar/lib/utils/position-week-events'

interface UseProcessedWeekEventsProps {
	days: dayjs.Dayjs[]
	allDay?: boolean
	dayNumberHeight?: number
	resourceId?: string | number
	gridType?: 'day' | 'hour'
}

export const useProcessedWeekEvents = ({
	days,
	allDay,
	dayNumberHeight,
	resourceId,
	gridType,
}: UseProcessedWeekEventsProps) => {
	const {
		getEventsForDateRange,
		dayMaxEvents,
		eventSpacing,
		getEventsForResource,
	} = useSmartCalendarContext((state) => ({
		getEventsForDateRange: state.getEventsForDateRange,
		dayMaxEvents: state.dayMaxEvents,
		eventSpacing: state.eventSpacing,
		getEventsForResource:
			'getEventsForResource' in state ? state.getEventsForResource : undefined,
	}))

	const weekStart = days[0]?.startOf('day') ?? dayjs()
	const weekEnd = days[days.length - 1]?.endOf('day') ?? dayjs()

	const events = useMemo<CalendarEvent[]>(() => {
		if (days.length === 0) return []
		let weekEvents = getEventsForDateRange(weekStart, weekEnd) as CalendarEvent[]
		if (resourceId && getEventsForResource) {
			const resourceEvents = getEventsForResource(resourceId)
			weekEvents = weekEvents.filter((event) =>
				resourceEvents.some((e) => String(e.id) === String(event.id))
			)
		}

		if (allDay) {
			weekEvents = weekEvents.filter((e) => !!e.allDay === allDay)
		}

		return weekEvents
	}, [
		getEventsForDateRange,
		getEventsForResource,
		weekStart,
		weekEnd,
		resourceId,
		allDay,
	])

	// Get all events that intersect with this week
	const positionedEvents = useMemo(() => {
		return getPositionedEvents({
			days,
			events,
			dayMaxEvents,
			dayNumberHeight,
			eventSpacing,
			gridType,
		})
	}, [days, dayMaxEvents, dayNumberHeight, eventSpacing, events, gridType])

	return positionedEvents
}
