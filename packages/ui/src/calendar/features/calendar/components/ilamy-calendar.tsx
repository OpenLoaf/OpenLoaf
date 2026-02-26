/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { type FC, useMemo } from 'react'
import { AnimatedSection } from '@openloaf/ui/calendar/components/animations/animated-section'
import { CalendarDndContext } from '@openloaf/ui/calendar/components/drag-and-drop/calendar-dnd-context'
import { EventFormDialog } from '@openloaf/ui/calendar/components/event-form/event-form-dialog'
import { Header } from '@openloaf/ui/calendar/components/header'
import type { CalendarEvent } from '@openloaf/ui/calendar/components/types'
import DayView from '@openloaf/ui/calendar/features/calendar/components/day-view/day-view'
import { MonthView } from '@openloaf/ui/calendar/features/calendar/components/month-view/month-view'
import WeekView from '@openloaf/ui/calendar/features/calendar/components/week-view/week-view'
import { useCalendarContext } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/context'
import { CalendarProvider } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/provider'
// oxlint-disable-next-line no-duplicates
import '@openloaf/ui/calendar/lib/configs/dayjs-config'
import type {
	IlamyCalendarPropEvent,
	IlamyCalendarProps,
} from '@openloaf/ui/calendar/features/calendar/types'
import {
	DAY_MAX_EVENTS_DEFAULT,
	GAP_BETWEEN_ELEMENTS,
	WEEK_DAYS_NUMBER_MAP,
} from '@openloaf/ui/calendar/lib/constants'
import { cn, normalizeEvents, safeDate } from '@openloaf/ui/calendar/lib/utils'

const CalendarContent: FC = () => {
	const { view, dayMaxEvents, sidebar, sidebarClassName, isSidebarOpen } =
		useCalendarContext()

	const viewMap = {
		month: <MonthView dayMaxEvents={dayMaxEvents} key="month" />,
		week: <WeekView key="week" />,
		day: <DayView key="day" />,
	}

	return (
		<div className="flex w-full h-full" data-testid="ilamy-calendar">
			{sidebar && isSidebarOpen && (
				<aside
					className={cn('h-full w-56 shrink-0', sidebarClassName)}
					data-testid="calendar-sidebar"
				>
					{sidebar}
				</aside>
			)}
			<div className="flex flex-col w-full h-full min-w-0">
				<Header className="p-1" />
				{/* Calendar Body with AnimatePresence for view transitions */}
				<CalendarDndContext>
					<AnimatedSection
						className="w-full h-[calc(100%-3.5rem)]"
						direction="horizontal"
						transitionKey={view}
					>
						<div className="border h-full w-full rounded-lg overflow-hidden" data-testid="calendar-body">
							{viewMap[view]}
						</div>
					</AnimatedSection>
				</CalendarDndContext>
				<EventFormDialog />
			</div>
		</div>
	)
}

export const IlamyCalendar: FC<IlamyCalendarProps> = ({
	events,
	firstDayOfWeek = 'sunday',
	initialView = 'month',
	initialDate,
	dayMaxEvents = DAY_MAX_EVENTS_DEFAULT,
	eventSpacing = GAP_BETWEEN_ELEMENTS,
	stickyViewHeader = true,
	viewHeaderClassName = '',
	timeFormat = '12-hour',
	hideNonBusinessHours = false,
	...props
}) => {
	const normalizedEvents = useMemo(
		() => normalizeEvents<IlamyCalendarPropEvent, CalendarEvent>(events),
		[events],
	)

	return (
		<CalendarProvider
			dayMaxEvents={dayMaxEvents}
			eventSpacing={eventSpacing}
			events={normalizedEvents}
			firstDayOfWeek={WEEK_DAYS_NUMBER_MAP[firstDayOfWeek]}
			hideNonBusinessHours={hideNonBusinessHours}
			initialDate={safeDate(initialDate)}
			initialView={initialView}
			stickyViewHeader={stickyViewHeader}
			timeFormat={timeFormat}
			viewHeaderClassName={viewHeaderClassName}
			{...props}
		>
			<CalendarContent />
		</CalendarProvider>
	)
}
