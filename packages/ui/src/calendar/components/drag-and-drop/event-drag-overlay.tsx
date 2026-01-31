import { DragOverlay } from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import type React from 'react'
import { useImperativeHandle, useState } from 'react'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'
import type { CalendarEvent } from '../types'

/** Check whether the value is a CSS color string. */
const isCssColorValue = (value?: string) => {
	if (!value) return false
	return (
		value.startsWith('#') ||
		value.startsWith('rgb(') ||
		value.startsWith('rgba(') ||
		value.startsWith('hsl(') ||
		value.startsWith('hsla(')
	)
}

/** Resolve className/style for event colors. */
const resolveEventColor = (
	value: string | undefined,
	fallbackClass: string,
	styleKey: 'backgroundColor' | 'color'
) => {
	if (!value) {
		return { className: fallbackClass, style: {} }
	}
	if (isCssColorValue(value)) {
		return { className: '', style: { [styleKey]: value } }
	}
	return { className: value, style: {} }
}

interface EventDragOverlayProps {
	ref: React.Ref<{ setActiveEvent: (event: DragOverlayEvent | null) => void }>
}

interface DragOverlayEvent {
	event: CalendarEvent
	width?: number
	height?: number
}

const getBorderRadiusClass = (
	isTruncatedStart: boolean,
	isTruncatedEnd: boolean
) => {
	if (isTruncatedStart && isTruncatedEnd) {
		return 'rounded-none'
	}
	if (isTruncatedStart) {
		return 'rounded-r-sm rounded-l-none'
	}
	if (isTruncatedEnd) {
		return 'rounded-l-sm rounded-r-none'
	}
	return 'rounded-sm'
}

export const EventDragOverlay: React.FC<EventDragOverlayProps> = ({ ref }) => {
	const [activeEvent, setActiveEvent] = useState<DragOverlayEvent | null>(null)

	useImperativeHandle(ref, () => ({
		setActiveEvent,
	}))

	return (
		<DragOverlay modifiers={[snapCenterToCursor]}>
			{activeEvent && (
				<div
					className="truncate shadow-lg"
					// 逻辑：尽量使用原事件尺寸，减少拖拽影子与真实事件的差异。
					style={{
						width: activeEvent.width ? Math.round(activeEvent.width) : undefined,
						height: activeEvent.height ? Math.round(activeEvent.height) : undefined,
					}}
				>
					<div
						className={cn(
							resolveEventColor(
								activeEvent.event.backgroundColor,
								'bg-blue-500',
								'backgroundColor'
							).className,
							resolveEventColor(activeEvent.event.color, 'text-white', 'color')
								.className,
							'h-full w-full px-1 border-[1.5px] border-card text-left overflow-clip relative',
							getBorderRadiusClass(
								Boolean(
									(activeEvent.event as { isTruncatedStart?: boolean })
										.isTruncatedStart
								),
								Boolean(
									(activeEvent.event as { isTruncatedEnd?: boolean })
										.isTruncatedEnd
								)
							)
						)}
						style={{
							...resolveEventColor(
								activeEvent.event.backgroundColor,
								'bg-blue-500',
								'backgroundColor'
							).style,
							...resolveEventColor(activeEvent.event.color, 'text-white', 'color')
								.style,
						}}
					>
						<p className="text-[10px] font-semibold sm:text-xs mt-0.5">
							{activeEvent.event.title}
						</p>
					</div>
				</div>
			)}
		</DragOverlay>
	)
}
