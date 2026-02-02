import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CalendarEvent } from '@tenas-ai/ui/calendar/components/types'
import { useSmartCalendarContext } from '@tenas-ai/ui/calendar/hooks/use-smart-calendar-context'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'

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
		return { className: fallbackClass, style: {} as CSSProperties }
	}
	if (isCssColorValue(value)) {
		return { className: '', style: { [styleKey]: value } as CSSProperties }
	}
	return { className: value, style: {} as CSSProperties }
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

function DraggableEventUnmemoized({
	elementId,
	event,
	className,
	style,
	disableDrag = false,
}: {
	elementId: string
	className?: string
	style?: CSSProperties
	event: CalendarEvent
	disableDrag?: boolean
}) {
	const {
		onEventClick,
		onEventDoubleClick,
		renderEvent,
		disableEventClick,
		disableDragAndDrop,
	} = useSmartCalendarContext((state) => ({
		onEventClick: state.onEventClick,
		onEventDoubleClick: state.onEventDoubleClick,
		renderEvent: state.renderEvent,
		disableEventClick: state.disableEventClick,
		disableDragAndDrop: state.disableDragAndDrop,
	}))

	const eventMeta = event.data as
		| { readOnly?: boolean; isSubscribed?: boolean }
		| undefined
	const isReadOnly =
		eventMeta?.readOnly === true || eventMeta?.isSubscribed === true
	const isDragDisabled = disableDrag || disableDragAndDrop || isReadOnly

	const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
		id: elementId,
		data: {
			event,
			type: 'calendar-event',
		},
		disabled: isDragDisabled,
	})
	const nodeRef = useRef<HTMLDivElement | null>(null)
	const [dragRect, setDragRect] = useState<DOMRect | null>(null)
	const dragTransform = transform ? CSS.Translate.toString(transform) : undefined

	useEffect(() => {
		if (!isDragging) {
			setDragRect(null)
			return
		}
		const node = nodeRef.current
		if (!node) {
			return
		}
		setDragRect(node.getBoundingClientRect())
	}, [isDragging])

	const overlayStyle: React.CSSProperties | undefined =
		isDragging && dragRect
			? {
					position: 'fixed',
					top: dragRect.top,
					left: dragRect.left,
					width: dragRect.width,
					height: dragRect.height,
					transform: dragTransform,
					zIndex: 9999,
					pointerEvents: 'none',
					opacity: 0.85,
				}
			: undefined

	// Default event content to render if custom renderEvent is not provided
	const DefaultEventContent = () => {
		// Check if this event has truncation information
		const enhancedEvent = event as unknown as {
			isTruncatedStart?: boolean
			isTruncatedEnd?: boolean
		}
		const isTruncatedStart = enhancedEvent.isTruncatedStart
		const isTruncatedEnd = enhancedEvent.isTruncatedEnd

		const background = resolveEventColor(
			event.backgroundColor,
			'bg-blue-500',
			'backgroundColor'
		)
		const textColor = resolveEventColor(event.color, 'text-white', 'color')

		return (
			<div
				className={cn(
					background.className,
					textColor.className,
					'h-full w-full px-1 border-[1.5px] border-card text-left overflow-clip relative',
						getBorderRadiusClass(
							Boolean(isTruncatedStart),
							Boolean(isTruncatedEnd)
						)
					)}
				style={{ ...background.style, ...textColor.style }}
			>
				{/* Left continuation indicator */}
				{isTruncatedStart && (
					<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground/25"></div>
				)}

				{/* Event title */}
				<p
					className={cn(
						'text-[10px] font-semibold sm:text-xs mt-0.5',
						// Add slight padding to avoid overlap with indicators
						isTruncatedStart && 'pl-1',
						isTruncatedEnd && 'pr-1'
					)}
				>
					{event.title}
				</p>

				{/* Right continuation indicator */}
				{isTruncatedEnd && (
					<div className="absolute right-0 top-0 bottom-0 w-0.5 bg-foreground/25"></div>
				)}
			</div>
		)
	}

	return (
		<>
			<div
				className={cn(
					'truncate h-full w-full',
					'cursor-default',
					isDragging && !isDragDisabled && 'shadow-lg',
					className
				)}
				onClick={(e) => {
					e.stopPropagation()
					onEventClick(event)
				}}
				onDoubleClick={(e) => {
					e.stopPropagation()
					onEventDoubleClick?.(event)
				}}
				ref={(node) => {
					nodeRef.current = node
					setNodeRef(node)
				}}
				style={style}
				{...attributes}
				{...listeners}
			>
				{/* Use custom renderEvent from context if available, otherwise use default */}
				{renderEvent ? renderEvent(event) : <DefaultEventContent />}
			</div>
			{isDragging &&
				overlayStyle &&
				typeof document !== 'undefined' &&
				createPortal(
					<div style={overlayStyle}>
						{renderEvent ? renderEvent(event) : <DefaultEventContent />}
					</div>,
					document.body
				)}
		</>
	)
}

export const DraggableEvent = memo(
	DraggableEventUnmemoized,
	(prevProps, nextProps) => {
		// Compare the essential props to prevent unnecessary re-renders
		return (
			prevProps.elementId === nextProps.elementId &&
			prevProps.disableDrag === nextProps.disableDrag &&
			prevProps.className === nextProps.className &&
			prevProps.event === nextProps.event
		)
	}
)
