/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { memo } from 'react'
import { DraggableEvent } from '@openloaf/ui/calendar/components/draggable-event/draggable-event'
import { useProcessedWeekEvents } from '@openloaf/ui/calendar/features/calendar/hooks/useProcessedWeekEvents'
import type dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { EVENT_BAR_HEIGHT } from '@openloaf/ui/calendar/lib/constants'

export interface HorizontalGridEventsLayerProps {
	days: dayjs.Dayjs[]
	gridType?: 'day' | 'hour'
	resourceId?: string | number
	dayNumberHeight?: number
	'data-testid'?: string
	allDay?: boolean
}

const NoMemoHorizontalGridEventsLayer: React.FC<
	HorizontalGridEventsLayerProps
> = ({
	days,
	gridType = 'day',
	resourceId,
	dayNumberHeight,
	'data-testid': dataTestId,
	allDay,
}) => {
	if (days.length === 0) return null
	const weekStart = days[0].startOf('day')

	const processedWeekEvents = useProcessedWeekEvents({
		days,
		gridType,
		resourceId,
		dayNumberHeight,
		allDay,
	})

	return (
		<div
			className="relative w-full h-full pointer-events-none z-10 overflow-clip"
			data-testid={dataTestId}
		>
			{processedWeekEvents.map((event) => {
				const eventKey = `${event.id}-${event.position}-${weekStart.toISOString()}-${resourceId ?? 'no-resource'}`

				return (
					<div
						className="absolute z-10 pointer-events-auto overflow-clip"
						data-left={event.left}
						data-testid={`horizontal-event-${event.id}`}
						data-top={event.top}
						data-width={event.width}
						key={`${eventKey}-wrapper`}
						style={{
							left: `calc(${event.left}% + var(--spacing) * 0.25)`,
							width: `calc(${event.width}% - var(--spacing) * 1)`,
							top: `${event.top}px`,
							height: `${EVENT_BAR_HEIGHT}px`,
						}}
					>
						<DraggableEvent
							className="h-full w-full shadow"
							elementId={eventKey}
							event={event}
						/>
					</div>
				)
			})}
		</div>
	)
}

export const HorizontalGridEventsLayer = memo(NoMemoHorizontalGridEventsLayer)
