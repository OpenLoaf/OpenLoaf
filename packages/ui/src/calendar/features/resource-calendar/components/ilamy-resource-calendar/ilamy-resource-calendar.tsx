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
import type { CalendarEvent } from '@openloaf/ui/calendar/components/types'
import { ResourceCalendarProvider } from '@openloaf/ui/calendar/features/resource-calendar/contexts/resource-calendar-context'
import type {
	IlamyResourceCalendarPropEvent,
	IlamyResourceCalendarProps,
} from '@openloaf/ui/calendar/features/resource-calendar/types'
import {
	DAY_MAX_EVENTS_DEFAULT,
	GAP_BETWEEN_ELEMENTS,
	WEEK_DAYS_NUMBER_MAP,
} from '@openloaf/ui/calendar/lib/constants'
import { normalizeEvents, safeDate } from '@openloaf/ui/calendar/lib/utils'
import { ResourceCalendarBody } from './resource-calendar-body'

export const IlamyResourceCalendar: React.FC<IlamyResourceCalendarProps> = ({
	events = [],
	resources = [],
	firstDayOfWeek = 'sunday',
	initialView = 'month',
	initialDate,
	disableDragAndDrop = false,
	dayMaxEvents = DAY_MAX_EVENTS_DEFAULT,
	timeFormat = '12-hour',
	eventSpacing = GAP_BETWEEN_ELEMENTS,
	...props
}) => {
	return (
		<ResourceCalendarProvider
			dayMaxEvents={dayMaxEvents}
			disableDragAndDrop={disableDragAndDrop}
			eventSpacing={eventSpacing}
			events={normalizeEvents<IlamyResourceCalendarPropEvent, CalendarEvent>(
				events
			)}
			firstDayOfWeek={WEEK_DAYS_NUMBER_MAP[firstDayOfWeek]}
			initialDate={safeDate(initialDate)}
			initialView={initialView}
			resources={resources}
			timeFormat={timeFormat}
			{...props}
		>
			<ResourceCalendarBody />
		</ResourceCalendarProvider>
	)
}
