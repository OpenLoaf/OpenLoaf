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
import {
	getPositionedDayEvents,
	type PositionedEvent,
} from '@openloaf/ui/calendar/lib/utils/position-day-events'

interface UseProcessedDayEventsProps {
	days: dayjs.Dayjs[] // The specific day this column represents
	gridType?: 'day' | 'hour'
	resourceId?: string | number
}

export const useProcessedDayEvents = ({
	days,
	gridType,
	resourceId,
}: UseProcessedDayEventsProps) => {
	const { getEventsForDateRange, getEventsForResource } =
		useSmartCalendarContext((state) => ({
			getEventsForDateRange: state.getEventsForDateRange,
			getEventsForResource:
				'getEventsForResource' in state ? state.getEventsForResource : undefined,
		}))
	const dayStart = days[0]?.startOf('day') ?? dayjs()
	const dayEnd = days[days.length - 1]?.endOf('day') ?? dayjs()

	const events = useMemo<CalendarEvent[]>(() => {
		if (days.length === 0) return []
		let dayEvents = getEventsForDateRange(dayStart, dayEnd) as CalendarEvent[]
		if (resourceId && getEventsForResource) {
			const resourceEvents = getEventsForResource(resourceId)
			dayEvents = dayEvents.filter((event) =>
				resourceEvents.some((re) => String(re.id) === String(event.id))
			)
		}

		// Vertical grids (Day/Week/Resource Vertical) never render all-day events
		// as those are handled by the all-day-row or are not appropriate for the time grid.
		return dayEvents.filter((e) => !e.allDay)
	}, [
		dayStart,
		dayEnd,
		getEventsForDateRange,
		resourceId,
		getEventsForResource,
	])

	const todayEvents = useMemo<PositionedEvent[]>(() => {
		return getPositionedDayEvents({
			days,
			events,
			gridType,
		})
	}, [days, gridType, events])

	return todayEvents
}
