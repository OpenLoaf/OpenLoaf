import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@tenas-ai/ui/calendar/components/ui/dialog'
import { useSmartCalendarContext } from '@tenas-ai/ui/calendar/hooks/use-smart-calendar-context'
import type { CalendarEvent } from '../types'
import { EventForm } from './event-form'

export const EventFormDialog = () => {
	const {
		t,
		selectedEvent,
		isEventFormOpen,
		closeEventForm,
		addEvent,
		updateEvent,
		deleteEvent,
		renderEventForm,
	} = useSmartCalendarContext((context) => ({
		t: context.t,
		selectedEvent: context.selectedEvent,
		isEventFormOpen: context.isEventFormOpen,
		closeEventForm: context.closeEventForm,
		addEvent: context.addEvent,
		updateEvent: context.updateEvent,
		deleteEvent: context.deleteEvent,
		renderEventForm: context.renderEventForm,
	}))

	const handleOnUpdate = (event: CalendarEvent) => {
		updateEvent(event.id, event)
	}

	const handleOnDelete = (event: CalendarEvent) => {
		deleteEvent(event.id)
	}

	const eventFormProps = {
		open: isEventFormOpen,
		onClose: closeEventForm,
		selectedEvent,
		onAdd: addEvent,
		onUpdate: handleOnUpdate,
		onDelete: handleOnDelete,
	}

	if (renderEventForm) {
		return renderEventForm(eventFormProps)
	}

	return (
		<Dialog onOpenChange={closeEventForm} open={isEventFormOpen}>
			<DialogContent className="flex flex-col max-h-[90vh] w-[95vw] max-w-md p-0 overflow-hidden gap-0">
				<DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b">
					<DialogTitle className="text-base">
						{selectedEvent?.id ? t('editEvent') : t('createEvent')}
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						{selectedEvent?.id ? t('editEventDetails') : t('addNewEvent')}
					</DialogDescription>
				</DialogHeader>

				<EventForm {...eventFormProps} />
			</DialogContent>
		</Dialog>
	)
}
