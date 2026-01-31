import type React from 'react'
import { ScrollArea, ScrollBar } from '@tenas-ai/ui/calendar/components/ui/scroll-area'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'
import { VerticalGridCol, type VerticalGridColProps } from './vertical-grid-col'
import { VerticalGridHeaderContainer } from './vertical-grid-header-container'

const BODY_HEIGHT = 'h-[calc(100%-3rem)]'

interface VerticalGridProps {
	columns: VerticalGridColProps[]
	children?: React.ReactNode
	gridType?: 'day' | 'hour'
	variant?: 'regular' | 'resource'
	classes?: { header?: string; body?: string; allDay?: string }
	allDayRow?: React.ReactNode
	scrollEnabled?: boolean
	cellClassName?: string
	subCellClassName?: string
	fillHeight?: boolean
	/**
	 * Optional array of minute slots by which the hour is divided
	 * e.g., [0, 15, 30, 45] for quarter-hour slots
	 */
	cellSlots?: number[]
}

export const VerticalGrid: React.FC<VerticalGridProps> = ({
	columns,
	children,
	gridType = 'day',
	variant = 'resource',
	classes,
	allDayRow,
	cellSlots,
	scrollEnabled = true,
	cellClassName,
	subCellClassName,
	fillHeight,
}) => {
	const isResourceCalendar = variant === 'resource'
	const isRegularCalendar = !isResourceCalendar
	const shouldFillHeight = fillHeight ?? !scrollEnabled

	const header = children && (
		<VerticalGridHeaderContainer
			allDayRow={allDayRow}
			classes={{ header: classes?.header, allDay: classes?.allDay }}
		>
			{children}
		</VerticalGridHeaderContainer>
	)

	const content = (
		<>
			{/* header row for resource calendar inside scroll area */}
			{isResourceCalendar && header}
			{/* Calendar area with scroll */}
			<div
				className={cn(
					'flex flex-1 w-fit',
					isResourceCalendar && BODY_HEIGHT,
					classes?.body
				)}
				data-testid="vertical-grid-body"
			>
				{/* Day columns with time slots */}
				{columns.map((column, index) => (
					<VerticalGridCol
						key={`${column.id}-${index}`}
						{...column}
						cellClassName={cellClassName}
						cellSlots={cellSlots}
						gridType={gridType}
						isLastColumn={index === columns.length - 1}
						subCellClassName={subCellClassName}
						fillHeight={shouldFillHeight}
					/>
				))}
			</div>
		</>
	)

	return (
		<div className="flex flex-col h-full" data-testid="vertical-grid-container">
			{/* header row */}
			{isRegularCalendar && header}
			{scrollEnabled ? (
				<ScrollArea
					className={cn(
						'h-full',
						isRegularCalendar && 'overflow-auto',
						isRegularCalendar && BODY_HEIGHT // scroll area becomes body in regular calendar
					)}
					data-testid="vertical-grid-scroll"
					viewPortProps={{ className: '*:flex! *:flex-col! *:min-h-full' }}
				>
					{content}
					<ScrollBar className="z-30" /> {/* vertical scrollbar */}
					<ScrollBar className="z-30" orientation="horizontal" />{' '}
					{/* horizontal scrollbar */}
				</ScrollArea>
			) : (
				<div
					className={cn('flex flex-col flex-1 min-h-0 overflow-hidden')}
					data-testid="vertical-grid-scroll"
				>
					{content}
				</div>
			)}
		</div>
	)
}
