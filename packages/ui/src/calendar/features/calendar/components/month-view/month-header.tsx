/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type React from 'react'
import { useCalendarContext } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/context'
import { cn } from '@openloaf/ui/calendar/lib/utils'
import { getWeekDays } from '@openloaf/ui/calendar/lib/utils/date-utils'

interface MonthHeaderProps {
	className?: string
}

export const MonthHeader: React.FC<MonthHeaderProps> = ({ className }) => {
	const { firstDayOfWeek, stickyViewHeader, viewHeaderClassName, currentDate } =
		useCalendarContext()

	// Reorder week days based on firstDayOfWeek
	const weekDays = getWeekDays(currentDate, firstDayOfWeek)

	return (
		<div
			className={cn(
				'flex w-full',
				stickyViewHeader && 'sticky top-0 z-20',
				viewHeaderClassName,
				className
			)}
			data-testid="month-header"
		>
			{weekDays.map((weekDay) => (
				<div
					className="py-2 text-center font-medium border-r last:border-r-0 border-b flex-1 text-muted-foreground"
					data-testid={`weekday-header-${weekDay.format('ddd').toLowerCase()}`}
					key={weekDay.toISOString()}
				>
					<span className="hidden sm:inline text-sm capitalize">{weekDay.format('ddd')}</span>
					<span className="sm:hidden text-xs capitalize">{weekDay.format('dd')}</span>
				</div>
			))}
		</div>
	)
}
