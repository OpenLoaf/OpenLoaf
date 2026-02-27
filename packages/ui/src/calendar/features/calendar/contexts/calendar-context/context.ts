/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createContext, useContext } from 'react'
import type { EventFormProps } from '@openloaf/ui/calendar/components/event-form/event-form'
import type { BusinessHours, CalendarEvent } from '@openloaf/ui/calendar/components/types'
import type {
	CalendarClassesOverride,
	CellClickInfo,
	RenderCurrentTimeIndicatorProps,
} from '@openloaf/ui/calendar/features/calendar/types'
import type { RecurrenceEditOptions } from '@openloaf/ui/calendar/features/recurrence/types'
import type dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import type { TranslationKey } from '@openloaf/ui/calendar/lib/translations/types'
import type { CalendarView, TimeFormat } from '@openloaf/ui/calendar/types'

export interface CalendarContextType {
	currentDate: dayjs.Dayjs
	view: CalendarView
	events: CalendarEvent[]
	rawEvents: CalendarEvent[] // Unprocessed events for export
	isEventFormOpen: boolean
	selectedEvent: CalendarEvent | null
	selectedDate: dayjs.Dayjs | null
	firstDayOfWeek: number // 0 for Sunday, 1 for Monday, etc.
	setCurrentDate: (date: dayjs.Dayjs) => void
	selectDate: (date: dayjs.Dayjs) => void
	setView: (view: CalendarView) => void
	nextPeriod: () => void
	prevPeriod: () => void
	today: () => void
	addEvent: (event: CalendarEvent) => void
	updateEvent: (eventId: string | number, event: Partial<CalendarEvent>) => void
	updateRecurringEvent: (
		event: CalendarEvent,
		updates: Partial<CalendarEvent>,
		options: RecurrenceEditOptions
	) => void
	deleteEvent: (eventId: string | number) => void
	deleteRecurringEvent: (
		event: CalendarEvent,
		options: RecurrenceEditOptions
	) => void
	openEventForm: (eventData?: Partial<CalendarEvent>) => void
	closeEventForm: () => void
	getEventsForDateRange: (
		startDate: dayjs.Dayjs,
		endDate: dayjs.Dayjs
	) => CalendarEvent[]
	findParentRecurringEvent: (event: CalendarEvent) => CalendarEvent | null
	renderEvent?: (event: CalendarEvent) => React.ReactNode
	onEventClick: (event: CalendarEvent) => void
	onEventDoubleClick?: (event: CalendarEvent) => void
	onCellClick: (info: CellClickInfo) => void
	openEventOnCellDoubleClick?: boolean
	currentLocale?: string
	disableCellClick?: boolean
	disableEventClick?: boolean
	disableDragAndDrop?: boolean
	dayMaxEvents: number
	eventSpacing: number
	stickyViewHeader: boolean
	viewHeaderClassName: string
	headerComponent?: React.ReactNode // Optional custom header component
	headerLeadingSlot?: React.ReactNode // Optional leading slot in header
	headerClassName?: string // Optional custom header class
	sidebar?: React.ReactNode // Optional sidebar component
	sidebarClassName?: string // Optional sidebar class
	isSidebarOpen: boolean
	setSidebarOpen: (open: boolean) => void
	toggleSidebar: () => void
	businessHours?: BusinessHours | BusinessHours[]
	renderEventForm?: (props: EventFormProps) => React.ReactNode
	// Translation function
	t: (key: TranslationKey) => string
	timeFormat: TimeFormat
	classesOverride?: CalendarClassesOverride
	renderCurrentTimeIndicator?: (
		props: RenderCurrentTimeIndicatorProps
	) => React.ReactNode
	hideNonBusinessHours?: boolean
	hideViewControls?: boolean
}

export const CalendarContext: React.Context<CalendarContextType | undefined> =
	createContext<CalendarContextType | undefined>(undefined)

export const useCalendarContext = (): CalendarContextType => {
	const context = useContext(CalendarContext)
	if (context === undefined) {
		throw new Error('useCalendarContext must be used within a CalendarProvider')
	}
	return context
}

/**
 * Simplified calendar context type for external use
 * Contains only the most commonly used calendar operations
 */
export interface UseIlamyCalendarContextReturn {
	readonly currentDate: dayjs.Dayjs
	readonly view: CalendarView
	readonly events: CalendarEvent[]
	readonly isEventFormOpen: boolean
	readonly selectedEvent: CalendarEvent | null
	readonly selectedDate: dayjs.Dayjs | null
	readonly firstDayOfWeek: number
	readonly setCurrentDate: (date: dayjs.Dayjs) => void
	readonly selectDate: (date: dayjs.Dayjs) => void
	readonly setView: (view: CalendarView) => void
	readonly nextPeriod: () => void
	readonly prevPeriod: () => void
	readonly today: () => void
	readonly addEvent: (event: CalendarEvent) => void
	readonly updateEvent: (
		eventId: string | number,
		event: Partial<CalendarEvent>
	) => void
	readonly deleteEvent: (eventId: string | number) => void
	readonly openEventForm: (eventData?: Partial<CalendarEvent>) => void
	readonly closeEventForm: () => void
	readonly businessHours?: BusinessHours | BusinessHours[]
}

export const useIlamyCalendarContext = (): UseIlamyCalendarContextReturn => {
	const context = useContext(CalendarContext)
	if (context === undefined) {
		throw new Error(
			'useIlamyCalendarContext must be used within a CalendarProvider'
		)
	}
	return {
		currentDate: context.currentDate,
		view: context.view,
		events: context.events,
		isEventFormOpen: context.isEventFormOpen,
		selectedEvent: context.selectedEvent,
		selectedDate: context.selectedDate,
		firstDayOfWeek: context.firstDayOfWeek,
		setCurrentDate: context.setCurrentDate,
		selectDate: context.selectDate,
		setView: context.setView,
		nextPeriod: context.nextPeriod,
		prevPeriod: context.prevPeriod,
		today: context.today,
		addEvent: context.addEvent,
		updateEvent: context.updateEvent,
		deleteEvent: context.deleteEvent,
		openEventForm: context.openEventForm,
		closeEventForm: context.closeEventForm,
		businessHours: context.businessHours,
	} as const
}
