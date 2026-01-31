import type React from 'react'
import { AnimatedSection } from '@tenas-ai/ui/calendar/components/animations/animated-section'
import { CalendarDndContext } from '@tenas-ai/ui/calendar/components/drag-and-drop/calendar-dnd-context'
import { EventFormDialog } from '@tenas-ai/ui/calendar/components/event-form/event-form-dialog'
import { Header } from '@tenas-ai/ui/calendar/components/header'
import type { CalendarEvent } from '@tenas-ai/ui/calendar/components/types'
import DayView from '@tenas-ai/ui/calendar/features/calendar/components/day-view/day-view'
import { MonthView } from '@tenas-ai/ui/calendar/features/calendar/components/month-view/month-view'
import WeekView from '@tenas-ai/ui/calendar/features/calendar/components/week-view/week-view'
import YearView from '@tenas-ai/ui/calendar/features/calendar/components/year-view/year-view'
import { useCalendarContext } from '@tenas-ai/ui/calendar/features/calendar/contexts/calendar-context/context'
import { CalendarProvider } from '@tenas-ai/ui/calendar/features/calendar/contexts/calendar-context/provider'
// oxlint-disable-next-line no-duplicates
import '@tenas-ai/ui/calendar/lib/configs/dayjs-config'
import type {
	IlamyCalendarPropEvent,
	IlamyCalendarProps,
} from '@tenas-ai/ui/calendar/features/calendar/types'
import {
	DAY_MAX_EVENTS_DEFAULT,
	GAP_BETWEEN_ELEMENTS,
	WEEK_DAYS_NUMBER_MAP,
} from '@tenas-ai/ui/calendar/lib/constants'
import { cn, normalizeEvents, safeDate } from '@tenas-ai/ui/calendar/lib/utils'

const CalendarContent: React.FC = () => {
	const { view, dayMaxEvents, sidebar, sidebarClassName, isSidebarOpen } =
		useCalendarContext()

	const viewMap = {
		month: <MonthView dayMaxEvents={dayMaxEvents} key="month" />,
		week: <WeekView key="week" />,
		day: <DayView key="day" />,
		year: <YearView key="year" />,
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
						<div className="border h-full w-full" data-testid="calendar-body">
							{viewMap[view]}
						</div>
					</AnimatedSection>
				</CalendarDndContext>
				<EventFormDialog />
			</div>
		</div>
	)
}

export const IlamyCalendar: React.FC<IlamyCalendarProps> = ({
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
	return (
		<CalendarProvider
			dayMaxEvents={dayMaxEvents}
			eventSpacing={eventSpacing}
			events={normalizeEvents<IlamyCalendarPropEvent, CalendarEvent>(events)}
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
