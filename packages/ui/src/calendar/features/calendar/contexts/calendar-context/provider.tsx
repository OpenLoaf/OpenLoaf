import type React from 'react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { EventFormProps } from '@openloaf/ui/calendar/components/event-form/event-form'
import type { BusinessHours, CalendarEvent } from '@openloaf/ui/calendar/components/types'
import type {
	CalendarClassesOverride,
	CellClickInfo,
	RenderCurrentTimeIndicatorProps,
} from '@openloaf/ui/calendar/features/calendar/types'
import { useCalendarEngine } from '@openloaf/ui/calendar/hooks/use-calendar-engine'
import type dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { GAP_BETWEEN_ELEMENTS } from '@openloaf/ui/calendar/lib/constants'
import type { Translations, TranslatorFunction } from '@openloaf/ui/calendar/lib/translations/types'
import type { CalendarView, TimeFormat } from '@openloaf/ui/calendar/types'
import { CalendarContext } from './context'

export interface CalendarProviderProps {
	children: ReactNode
	events?: CalendarEvent[]
	firstDayOfWeek?: number // 0 for Sunday, 1 for Monday, etc.
	initialView?: CalendarView
	initialDate?: dayjs.Dayjs
	renderEvent?: (event: CalendarEvent) => ReactNode
	onEventClick?: (event: CalendarEvent) => void
	onEventDoubleClick?: (event: CalendarEvent) => void
	onCellClick?: (info: CellClickInfo) => void
	openEventOnCellDoubleClick?: boolean
	onViewChange?: (view: CalendarView) => void
	onEventAdd?: (event: CalendarEvent) => void
	onEventUpdate?: (event: CalendarEvent) => void
	onEventDelete?: (event: CalendarEvent) => void
	onDateChange?: (date: dayjs.Dayjs) => void
	locale?: string
	timezone?: string
	disableCellClick?: boolean
	disableEventClick?: boolean
	openEventOnDoubleClick?: boolean
	disableDragAndDrop?: boolean
	dayMaxEvents: number
	eventSpacing?: number
	stickyViewHeader?: boolean
	viewHeaderClassName?: string
	headerComponent?: ReactNode // Optional custom header component
	headerLeadingSlot?: ReactNode // Optional leading slot in header
	headerClassName?: string // Optional custom header class
	sidebar?: ReactNode
	defaultSidebarOpen?: boolean
	onSidebarOpenChange?: (open: boolean) => void
	sidebarClassName?: string
	businessHours?: BusinessHours | BusinessHours[]
	renderEventForm?: (props: EventFormProps) => ReactNode
	// Translation options - provide either translations object OR translator function
	translations?: Translations
	translator?: TranslatorFunction
	timeFormat?: TimeFormat
	classesOverride?: CalendarClassesOverride
	renderCurrentTimeIndicator?: (
		props: RenderCurrentTimeIndicatorProps
	) => ReactNode
	hideNonBusinessHours?: boolean
	hideViewControls?: boolean
}

export const CalendarProvider: React.FC<CalendarProviderProps> = ({
	children,
	events = [],
	firstDayOfWeek = 0,
	initialView = 'month',
	initialDate,
	renderEvent,
	onEventClick,
	onEventDoubleClick,
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
	openEventOnDoubleClick = false,
	disableDragAndDrop,
	dayMaxEvents,
	eventSpacing = GAP_BETWEEN_ELEMENTS,
	stickyViewHeader = true,
	viewHeaderClassName = '',
	headerComponent,
	headerLeadingSlot,
	headerClassName,
	sidebar,
	defaultSidebarOpen = true,
	onSidebarOpenChange,
	sidebarClassName,
	businessHours,
	renderEventForm,
	translations,
	translator,
	timeFormat = '12-hour',
	classesOverride,
	renderCurrentTimeIndicator,
	hideNonBusinessHours = false,
	hideViewControls = false,
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
		onViewChange,
		locale,
		timezone,
		translations,
		translator,
	})

	const editEvent = useCallback(
		(event: CalendarEvent) => {
			calendarEngine.setSelectedEvent(event)
			calendarEngine.setIsEventFormOpen(true)
		},
		[calendarEngine]
	)

	/** Check whether a calendar event is read-only. */
	const isEventReadOnly = useCallback((event: CalendarEvent) => {
		const meta = event.data as
			| { readOnly?: boolean; isSubscribed?: boolean }
			| undefined
		return meta?.readOnly === true || meta?.isSubscribed === true
	}, [])

	// Custom handlers that call external callbacks
	const handleEventClick = useCallback(
		(event: CalendarEvent) => {
			if (disableEventClick) {
				return
			}
			if (onEventClick) {
				onEventClick(event)
				return
			}
			if (!openEventOnDoubleClick) {
				if (isEventReadOnly(event)) {
					return
				}
				editEvent(event)
			}
		},
		[
			disableEventClick,
			onEventClick,
			editEvent,
			openEventOnDoubleClick,
			isEventReadOnly,
		]
	)

	const handleEventDoubleClick = useCallback(
		(event: CalendarEvent) => {
			if (disableEventClick) {
				return
			}
			if (onEventDoubleClick) {
				onEventDoubleClick(event)
				return
			}
			if (openEventOnDoubleClick) {
				if (isEventReadOnly(event)) {
					return
				}
				editEvent(event)
			}
		},
		[
			disableEventClick,
			onEventDoubleClick,
			editEvent,
			openEventOnDoubleClick,
			isEventReadOnly,
		]
	)

	const handleDateClick = useCallback(
		(info: CellClickInfo) => {
			if (disableCellClick) {
				return
			}

			if (onCellClick) {
				onCellClick(info)
			} else {
				calendarEngine.openEventForm(info)
			}
		},
		[onCellClick, disableCellClick, calendarEngine]
	)

	// Create the context value
	const contextValue = useMemo(
		() => ({
			currentDate: calendarEngine.currentDate,
			view: calendarEngine.view,
			events: calendarEngine.events,
			rawEvents: calendarEngine.rawEvents,
			currentLocale: calendarEngine.currentLocale,
			isEventFormOpen: calendarEngine.isEventFormOpen,
			selectedEvent: calendarEngine.selectedEvent,
			selectedDate: calendarEngine.selectedDate,
			firstDayOfWeek: calendarEngine.firstDayOfWeek,
			setCurrentDate: calendarEngine.setCurrentDate,
			selectDate: calendarEngine.selectDate,
			setView: calendarEngine.setView,
			nextPeriod: calendarEngine.nextPeriod,
			prevPeriod: calendarEngine.prevPeriod,
			today: calendarEngine.today,
			addEvent: calendarEngine.addEvent,
			updateEvent: calendarEngine.updateEvent,
			updateRecurringEvent: calendarEngine.updateRecurringEvent,
			deleteEvent: calendarEngine.deleteEvent,
			deleteRecurringEvent: calendarEngine.deleteRecurringEvent,
			openEventForm: calendarEngine.openEventForm,
			closeEventForm: calendarEngine.closeEventForm,
			getEventsForDateRange: calendarEngine.getEventsForDateRange,
			findParentRecurringEvent: calendarEngine.findParentRecurringEvent,
			renderEvent,
			onEventClick: handleEventClick,
			onEventDoubleClick: handleEventDoubleClick,
			onCellClick: handleDateClick,
			openEventOnCellDoubleClick,
			locale,
			timezone,
			disableCellClick,
			disableEventClick,
			openEventOnDoubleClick,
			disableDragAndDrop,
			dayMaxEvents,
			eventSpacing,
			stickyViewHeader,
			viewHeaderClassName,
			headerComponent,
			headerLeadingSlot,
			headerClassName,
			sidebar,
			sidebarClassName,
			isSidebarOpen,
			setSidebarOpen: handleSetSidebarOpen,
			toggleSidebar,
			businessHours,
			renderEventForm,
			t: calendarEngine.t,
			timeFormat,
			classesOverride,
			renderCurrentTimeIndicator,
			hideNonBusinessHours,
			hideViewControls,
		}),
		[
			calendarEngine,
			renderEvent,
			handleEventClick,
			handleEventDoubleClick,
			handleDateClick,
			openEventOnCellDoubleClick,
			locale,
			timezone,
			disableCellClick,
			disableEventClick,
			openEventOnDoubleClick,
			disableDragAndDrop,
			dayMaxEvents,
			eventSpacing,
			stickyViewHeader,
			viewHeaderClassName,
			headerComponent,
			headerLeadingSlot,
			headerClassName,
			sidebar,
			sidebarClassName,
			isSidebarOpen,
			handleSetSidebarOpen,
			toggleSidebar,
			businessHours,
			renderEventForm,
			timeFormat,
			classesOverride,
			renderCurrentTimeIndicator,
			hideNonBusinessHours,
			hideViewControls,
		]
	)

	return (
		<CalendarContext.Provider value={contextValue}>
			{children}
		</CalendarContext.Provider>
	)
}
