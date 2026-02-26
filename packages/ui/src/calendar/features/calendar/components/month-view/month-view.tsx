import type React from 'react'
import { useMemo } from 'react'
import { HorizontalGrid } from '@openloaf/ui/calendar/components/horizontal-grid/horizontal-grid'
import { useCalendarContext } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/context'
import { getMonthWeeks } from '@openloaf/ui/calendar/lib/utils/date-utils'
import { MonthHeader } from './month-header'
import type { MonthViewProps } from './types'

export const MonthView: React.FC<MonthViewProps> = () => {
	const { currentDate, firstDayOfWeek } = useCalendarContext()

	const weeks = useMemo(
		() => getMonthWeeks(currentDate, firstDayOfWeek),
		[currentDate, firstDayOfWeek]
	)

	const rows = weeks.map((days, weekIndex) => ({
		id: `week-${weekIndex}`,
		columns: days.map((day) => ({
			id: `col-${day.toISOString()}`,
			day,
			className: 'w-auto',
			gridType: 'day' as const,
		})),
		className: 'flex-1',
		showDayNumber: true,
	}))

	return (
		<HorizontalGrid
			classes={{ body: 'w-full', header: 'w-full' }}
			rows={rows}
			variant="regular"
		>
			<MonthHeader className="h-12" />
		</HorizontalGrid>
	)
}
