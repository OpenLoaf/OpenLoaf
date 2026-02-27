/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { DragOverlay } from '@dnd-kit/core'
import { useDndContext } from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import type React from 'react'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { EVENT_BAR_HEIGHT } from '@openloaf/ui/calendar/lib/constants'
import { cn } from '@openloaf/ui/calendar/lib/utils'
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

export interface EventDragOverlayHandle {
	setActiveEvent: (event: DragOverlayEvent | null) => void
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

export const EventDragOverlay = forwardRef<EventDragOverlayHandle, {}>(
	(_props, ref) => {
		const [activeEvent, setActiveEvent] = useState<DragOverlayEvent | null>(null)
		const { active, activeNodeRect, dragOverlay, draggableNodes } = useDndContext()

		useImperativeHandle(ref, () => ({
			setActiveEvent,
		}))

		useEffect(() => {
			if (activeEvent) {
				console.info('[dnd] overlay-active', {
					title: activeEvent.event.title,
					width: activeEvent.width,
					height: activeEvent.height,
				})
				// 逻辑：拖拽时检查 overlay 是否真实挂载到 DOM 以及可见性。
				requestAnimationFrame(() => {
					const overlay =
						document.querySelector('[data-dnd-kit-overlay]') ||
						document.querySelector('.dnd-kit-drag-overlay')
					if (!overlay) {
						console.info('[dnd] overlay-dom', { found: false })
						return
					}
					const style = window.getComputedStyle(overlay as Element)
					console.info('[dnd] overlay-dom', {
						found: true,
						display: style.display,
						visibility: style.visibility,
						opacity: style.opacity,
						zIndex: style.zIndex,
					})
				})
			} else {
				console.info('[dnd] overlay-clear')
			}
		}, [activeEvent])

		useEffect(() => {
			const overlayRect =
				dragOverlay && 'rect' in dragOverlay
					? (dragOverlay as unknown as { rect?: DOMRect | ClientRect | null })
							.rect ?? null
					: null
			console.info('[dnd] dnd-context-active', {
				activeId: active?.id ?? null,
				hasActive: Boolean(active),
				activeNodeRect,
				dragOverlayRect: overlayRect,
				hasOverlayNode: Boolean(dragOverlay?.nodeRef?.current),
				hasDraggableNode: active ? draggableNodes?.has(active.id) : false,
			})
			if (active) {
				const entry = draggableNodes?.get(active.id)
				const node = entry?.node?.current ?? null
				const activator = entry?.activatorNode?.current ?? null
				const entryRect =
					(entry as unknown as {
						rect?: { current?: DOMRect | ClientRect | null }
					} | null)?.rect?.current ?? null
				const isConnected = node ? node.isConnected : null
				const rect = node ? node.getBoundingClientRect() : null
				console.info('[dnd] active-node', {
					hasNode: Boolean(node),
					hasActivator: Boolean(activator),
					hasEntryRect: Boolean(entryRect),
					entryRect,
					isConnected,
					nodeRect: rect
						? {
								width: rect.width,
								height: rect.height,
								top: rect.top,
								left: rect.left,
							}
						: null,
					nodeTag: node?.tagName ?? null,
				})
			}
		}, [active, activeNodeRect, dragOverlay, draggableNodes])

		return (
			<DragOverlay modifiers={[snapCenterToCursor]}>
				{activeEvent && (
					<div
						className="truncate shadow-lg"
						// 逻辑：尽量使用原事件尺寸，减少拖拽影子与真实事件的差异。
						style={{
							width: activeEvent.width
								? Math.round(activeEvent.width)
								: undefined,
							height: activeEvent.height
								? Math.round(activeEvent.height)
								: undefined,
							minWidth: 80,
							minHeight: EVENT_BAR_HEIGHT,
						}}
					>
						<div
							className={cn(
								resolveEventColor(
									activeEvent.event.backgroundColor,
									'bg-blue-500',
									'backgroundColor'
								).className,
								resolveEventColor(
									activeEvent.event.color,
									'text-white',
									'color'
								).className,
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
								...resolveEventColor(
									activeEvent.event.color,
									'text-white',
									'color'
								).style,
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
)
