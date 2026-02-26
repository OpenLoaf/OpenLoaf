import type React from 'react'
import { AnimatedSection } from '@openloaf/ui/calendar/components/animations/animated-section'
import { CalendarDndContext } from '@openloaf/ui/calendar/components/drag-and-drop/calendar-dnd-context'
import { EventFormDialog } from '@openloaf/ui/calendar/components/event-form/event-form-dialog'
import { Header } from '@openloaf/ui/calendar/components/header'
import { ResourceDayView } from '@openloaf/ui/calendar/features/resource-calendar/components/day-view'
import { ResourceMonthView } from '@openloaf/ui/calendar/features/resource-calendar/components/month-view'
import { ResourceWeekView } from '@openloaf/ui/calendar/features/resource-calendar/components/week-view'
import { useResourceCalendarContext } from '@openloaf/ui/calendar/features/resource-calendar/contexts/resource-calendar-context'
import { cn } from '@openloaf/ui/calendar/lib/utils'

export const ResourceCalendarBody: React.FC = () => {
	const { view, sidebar, sidebarClassName, isSidebarOpen } =
		useResourceCalendarContext()

	const viewMap = {
		month: <ResourceMonthView key="month" />,
		week: <ResourceWeekView key="week" />,
		day: <ResourceDayView key="day" />,
	}
	const viewContent =
		viewMap[view as keyof typeof viewMap] ?? viewMap.month

	return (
		<div className="flex w-full h-full" data-testid="ilamy-resource-calendar">
			{sidebar && isSidebarOpen && (
				<aside
					className={cn('h-full w-64 shrink-0', sidebarClassName)}
					data-testid="calendar-sidebar"
				>
					{sidebar}
				</aside>
			)}
			<div className="flex flex-col w-full h-full min-w-0">
				<Header className="p-1" />

				{/* Calendar Body with AnimatedSection for view transitions */}
				<CalendarDndContext>
					<AnimatedSection
						className="w-full h-[calc(100%-3.5rem)] @container/calendar-body"
						direction="horizontal"
						transitionKey={view}
					>
						<div className="border h-full w-full" data-testid="calendar-body">
							{viewContent}
						</div>
					</AnimatedSection>
				</CalendarDndContext>

				{/* Event Form Dialog */}
				<EventFormDialog />
			</div>
		</div>
	)
}
