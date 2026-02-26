import { memo } from 'react'
import { CurrentTimeIndicator } from '@openloaf/ui/calendar/components/current-time-indicator'
import { DraggableEvent } from '@openloaf/ui/calendar/components/draggable-event/draggable-event'
import { useProcessedDayEvents } from '@openloaf/ui/calendar/features/calendar/hooks/useProcessedDayEvents'
import type { Resource } from '@openloaf/ui/calendar/features/resource-calendar/types'
import type dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@openloaf/ui/calendar/lib/utils'

interface VerticalGridEventsLayerProps {
	gridType?: 'day' | 'hour'
	days: dayjs.Dayjs[] // The specific day this layer represents
	resourceId?: string | number
	resource?: Resource
	'data-testid'?: string
}

const NoMemoVerticalGridEventsLayer: React.FC<VerticalGridEventsLayerProps> = ({
	days,
	gridType = 'hour',
	resourceId,
	resource,
	'data-testid': dataTestId,
}) => {
	if (days.length === 0) return null
	const todayEvents = useProcessedDayEvents({ days, gridType, resourceId })
	const rangeStart = days[0]
	const rangeEnd = days[days.length - 1]?.add(1, gridType)

	return (
		<div
			className="relative w-full h-full pointer-events-none z-10 overflow-clip"
			data-testid={dataTestId}
		>
			{rangeStart && rangeEnd && (
				<CurrentTimeIndicator
					rangeEnd={rangeEnd}
					rangeStart={rangeStart}
					resource={resource}
				/>
			)}
			{todayEvents.map((event, index) => {
				const eventKey = `event-${event.id}-${index}-${rangeStart.toISOString()}-${resourceId ?? 'no-resource'}`
				const isShortEvent = event.end.diff(event.start, 'minute') <= 15

				return (
					<div
						className="absolute"
						key={`${eventKey}-wrapper`}
						style={{
							left: `${event.left}%`,
							width: `calc(${event.width}% - var(--spacing) * 2)`,
							top: `${event.top}%`,
							height: `${event.height}%`,
						}}
					>
						<DraggableEvent
							className={cn('pointer-events-auto absolute', {
								'[&_p]:text-[10px] [&_p]:mt-0': isShortEvent,
							})}
							elementId={eventKey}
							event={event}
						/>
					</div>
				)
			})}
		</div>
	)
}

export const VerticalGridEventsLayer = memo(NoMemoVerticalGridEventsLayer)
