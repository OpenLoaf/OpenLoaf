import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { CalendarEvent } from '@openloaf/ui/calendar/components/types'
import type { CalendarProviderProps } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/provider'
import type {
	CalendarClassesOverride,
	CellClickInfo,
	RenderCurrentTimeIndicatorProps,
} from '@openloaf/ui/calendar/features/calendar/types'
import type { Resource } from '@openloaf/ui/calendar/features/resource-calendar/types'
import { useCalendarEngine } from '@openloaf/ui/calendar/hooks/use-calendar-engine'
import { GAP_BETWEEN_ELEMENTS } from '@openloaf/ui/calendar/lib/constants'
import { ResourceCalendarContext } from './context'

const getEventResourceIds = (event: CalendarEvent): (string | number)[] => {
	if (event.resourceIds) {
		return event.resourceIds
	}
	if (event.resourceId !== undefined) {
		return [event.resourceId]
	}
	return []
}

interface ResourceCalendarProviderProps extends CalendarProviderProps {
	events?: CalendarEvent[]
	resources?: Resource[]
	renderResource?: (resource: Resource) => React.ReactNode
	classesOverride?: CalendarClassesOverride
	orientation?: 'horizontal' | 'vertical'
	renderCurrentTimeIndicator?: (
		props: RenderCurrentTimeIndicatorProps
	) => React.ReactNode
	hideNonBusinessHours?: boolean
}

export const ResourceCalendarProvider: React.FC<
	ResourceCalendarProviderProps
> = ({
	children,
	events = [],
	resources = [],
	firstDayOfWeek = 0,
	initialView = 'month',
	initialDate,
	renderEvent,
	onEventClick,
	onCellClick,
	openEventOnCellDoubleClick = false,
	onViewChange,
	onEventAdd,
	onEventUpdate,
	onEventDelete,
	onDateChange,
	locale,
	timezone,
	disableCellClick,
	disableEventClick,
	disableDragAndDrop,
	dayMaxEvents,
	eventSpacing = GAP_BETWEEN_ELEMENTS,
	stickyViewHeader = true,
	viewHeaderClassName = '',
	headerComponent,
	headerClassName,
	sidebar,
	defaultSidebarOpen = true,
	onSidebarOpenChange,
	sidebarClassName,
	translations,
	translator,
	renderResource,
	renderEventForm,
	businessHours,
	timeFormat = '12-hour',
	classesOverride,
	orientation = 'horizontal',
	renderCurrentTimeIndicator,
	hideNonBusinessHours = false,
}) => {
	const [isSidebarOpen, setIsSidebarOpen] = useState(defaultSidebarOpen)
	const handleSetSidebarOpen = useCallback(
		(open: boolean) => {
			setIsSidebarOpen(open)
			if (onSidebarOpenChange) {
				onSidebarOpenChange(open)
			}
		},
		[onSidebarOpenChange]
	)
	const toggleSidebar = useCallback(() => {
		handleSetSidebarOpen(!isSidebarOpen)
	}, [handleSetSidebarOpen, isSidebarOpen])

	// Resource-specific state
	const [currentResources] = useState<Resource[]>(resources)
	const [visibleResources, setVisibleResources] = useState<
		Set<string | number>
	>(new Set(resources.map((r) => r.id)))

	// Use the calendar engine
	const calendarEngine = useCalendarEngine({
		events,
		firstDayOfWeek,
		initialView,
		initialDate,
		businessHours,
		onEventAdd,
		onEventUpdate,
		onEventDelete,
		onDateChange,
		onViewChange: onViewChange,
		locale,
		timezone,
		translations,
		translator,
	})

	// Resource visibility
	const toggleResourceVisibility = useCallback(
		(resourceId: string | number) => {
			setVisibleResources((prev) => {
				const newSet = new Set(prev)
				if (newSet.has(resourceId)) {
					newSet.delete(resourceId)
				} else {
					newSet.add(resourceId)
				}
				return newSet
			})
		},
		[]
	)

	const showResource = useCallback((resourceId: string | number) => {
		setVisibleResources((prev) => new Set(prev).add(resourceId))
	}, [])

	const hideResource = useCallback((resourceId: string | number) => {
		setVisibleResources((prev) => {
			const newSet = new Set(prev)
			newSet.delete(resourceId)
			return newSet
		})
	}, [])

	const showAllResources = useCallback(() => {
		setVisibleResources(new Set(currentResources.map((r) => r.id)))
	}, [currentResources])

	const hideAllResources = useCallback(() => {
		setVisibleResources(new Set())
	}, [])

	// Event utilities
	const getEventsForResource = useCallback(
		(resourceId: string | number): CalendarEvent[] => {
			return calendarEngine.events.filter((event: CalendarEvent) => {
				if (event.resourceIds) {
					return event.resourceIds.includes(resourceId)
				}
				return event.resourceId === resourceId
			})
		},
		[calendarEngine.events]
	)

	const getEventsForResources = useCallback(
		(resourceIds: (string | number)[]): CalendarEvent[] => {
			return calendarEngine.events.filter((event: CalendarEvent) => {
				const eventResourceIds = getEventResourceIds(event)
				return eventResourceIds.some((id) => resourceIds.includes(id))
			})
		},
		[calendarEngine.events]
	)

	const getResourceById = useCallback(
		(resourceId: string | number): Resource | undefined => {
			return currentResources.find((resource) => resource.id === resourceId)
		},
		[currentResources]
	)

	const getVisibleResources = useCallback((): Resource[] => {
		return currentResources.filter((resource) =>
			visibleResources.has(resource.id)
		)
	}, [currentResources, visibleResources])

	// Cross-resource event utilities
	const isEventCrossResource = useCallback((event: CalendarEvent): boolean => {
		return Boolean(event.resourceIds && event.resourceIds.length > 1)
	}, [])

	// Custom handlers
	const editEvent = useCallback(
		(event: CalendarEvent) => {
			calendarEngine.setSelectedEvent(event)
			calendarEngine.setIsEventFormOpen(true)
		},
		[calendarEngine]
	)

	const handleEventClick = useCallback(
		(event: CalendarEvent) => {
			if (disableEventClick) {
				return
			}
			if (onEventClick) {
				onEventClick(event)
			} else {
				editEvent(event)
			}
		},
		[disableEventClick, onEventClick, editEvent]
	)

	const handleDateClick = useCallback(
		(info: CellClickInfo) => {
			if (disableCellClick) {
				return
			}

			if (onCellClick) {
				onCellClick(info)
			} else {
				const newEvent: CalendarEvent = {
					title: calendarEngine.t('newEvent'),
					start: info.start,
					end: info.end,
					description: '',
					allDay: false,
				} as CalendarEvent

				if (info.resourceId !== undefined) {
					newEvent.resourceId = info.resourceId
				}

				calendarEngine.setSelectedEvent(newEvent)
				calendarEngine.setSelectedDate(info.start)
				calendarEngine.setIsEventFormOpen(true)
			}
		},
		[onCellClick, disableCellClick, calendarEngine]
	)

	// Create the context value
	const contextValue = useMemo(
		() => ({
			...calendarEngine,
			view: calendarEngine.view,
			setView: calendarEngine.setView,
			events: calendarEngine.events,
			rawEvents: calendarEngine.rawEvents,

			// Resource-specific state
			resources: currentResources,
			visibleResources,
			toggleResourceVisibility,
			showResource,
			hideResource,
			showAllResources,
			hideAllResources,

			// Resource utilities
			getEventsForResource,
			getEventsForResources,
			getResourceById,
			getVisibleResources,

			// Cross-resource event utilities
			isEventCrossResource,
			getEventResourceIds,

			// Override handlers
			onEventClick: handleEventClick,
			onCellClick: handleDateClick,
			openEventOnCellDoubleClick,

			// Pass through header props
			headerComponent,
			headerClassName,
			sidebar,
			sidebarClassName,
			isSidebarOpen,
			setSidebarOpen: handleSetSidebarOpen,
			toggleSidebar,

			// Pass through other props
			renderEvent,
			renderResource,
			renderEventForm,
			locale,
			timezone,
			disableCellClick,
			disableEventClick,
				disableDragAndDrop,
			dayMaxEvents,
			eventSpacing,
			stickyViewHeader,
			viewHeaderClassName,
			businessHours,
			timeFormat,
			classesOverride,
			orientation,
			renderCurrentTimeIndicator,
			hideNonBusinessHours,
		}),
		[
			calendarEngine,
			currentResources,
			visibleResources,
			toggleResourceVisibility,
			showResource,
			hideResource,
			showAllResources,
			hideAllResources,
			getEventsForResource,
			getEventsForResources,
			getResourceById,
			getVisibleResources,
			isEventCrossResource,
			handleEventClick,
			handleDateClick,
			renderEvent,
			renderResource,
			renderEventForm,
			locale,
			timezone,
			disableCellClick,
			disableEventClick,
			openEventOnCellDoubleClick,
			disableDragAndDrop,
			dayMaxEvents,
			eventSpacing,
			stickyViewHeader,
			viewHeaderClassName,
			headerComponent,
			headerClassName,
			sidebar,
			sidebarClassName,
			isSidebarOpen,
			handleSetSidebarOpen,
			toggleSidebar,
			businessHours,
			timeFormat,
			classesOverride,
			orientation,
			renderCurrentTimeIndicator,
			hideNonBusinessHours,
		]
	)

	return (
		<ResourceCalendarContext.Provider value={contextValue}>
			{children}
		</ResourceCalendarContext.Provider>
	)
}
