/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { AllDayRow } from '@openloaf/ui/calendar/components/all-day-row/all-day-row'
import { VerticalGrid } from '@openloaf/ui/calendar/components/vertical-grid/vertical-grid'
import { useCalendarContext } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/context'
import { getViewHours } from '@openloaf/ui/calendar/features/calendar/utils/view-hours'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@openloaf/ui/calendar/lib/utils'
import { formatFullDate } from '@openloaf/ui/calendar/lib/utils/date-utils'

const DayView = () => {
	const {
		currentDate,
		currentLocale,
		timeFormat,
		t,
		businessHours,
		hideNonBusinessHours,
	} = useCalendarContext()
	const isToday = currentDate.isSame(dayjs(), 'day')
	const hours = getViewHours({
		referenceDate: currentDate,
		businessHours,
		hideNonBusinessHours,
		allDates: [currentDate],
	})

	const firstCol = {
		id: 'time-col',
		day: currentDate,
		days: hours,
		className:
			'shrink-0 w-14 sm:w-20 min-w-14 sm:min-w-20 max-w-14 sm:max-w-20 sticky left-0 bg-background z-20',
		gridType: 'hour' as const,
		noEvents: true,
		renderCell: (date: dayjs.Dayjs) => {
			const localeLower = currentLocale?.toLowerCase()
			const use24HourLabel =
				localeLower?.startsWith('zh') ||
				localeLower?.startsWith('ja') ||
				localeLower?.startsWith('ko')
			const label = use24HourLabel
				? `${date.format('H')}时`
				: Intl.DateTimeFormat(currentLocale, {
						hour: 'numeric',
						hour12: timeFormat === '12-hour',
					}).format(date.toDate())
			return (
				<div className="text-muted-foreground border-r p-1 sm:p-2 text-right text-[10px] sm:text-xs flex flex-col items-center">
					{label}
				</div>
			)
		},
	}

	const columns = {
		id: `day-col-${currentDate.format('YYYY-MM-DD')}`,
		day: currentDate,
		days: hours,
		className: 'w-[calc(100%-3.5rem)] sm:w-[calc(100%-5rem)] flex-1',
		gridType: 'hour' as const,
	}

	return (
		<VerticalGrid
			allDayRow={<AllDayRow days={[currentDate]} />}
			cellSlots={[0, 15, 30, 45]}
			classes={{ header: 'w-full', body: 'w-full', allDay: 'w-full' }}
			columns={[firstCol, columns]}
			gridType="hour"
			variant="regular"
		>
			{/* Header */}
			<div
				className={'flex h-full flex-1 justify-center items-center'}
				data-testid="day-view-header"
			>
				<div
					className={cn(
						'flex justify-center items-center text-center text-base font-semibold sm:text-xl',
						isToday && 'text-primary'
					)}
				>
					<span className="xs:inline hidden">
						{currentDate.format('dddd, ')}
					</span>
					{formatFullDate(currentDate, currentLocale)}
					{isToday && (
						<span className="bg-primary text-primary-foreground ml-2 rounded-full px-1 py-0.5 text-xs sm:px-2 sm:text-sm">
							{t('today')}
						</span>
					)}
				</div>
			</div>
		</VerticalGrid>
	)
}

export default DayView
