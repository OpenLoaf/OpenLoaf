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
import { useMemo } from 'react'
import { AllDayRow } from '@openloaf/ui/calendar/components/all-day-row/all-day-row'
import { VerticalGrid } from '@openloaf/ui/calendar/components/vertical-grid/vertical-grid'
import { useCalendarContext } from '@openloaf/ui/calendar/features/calendar/contexts/calendar-context/context'
import { getViewHours } from '@openloaf/ui/calendar/features/calendar/utils/view-hours'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@openloaf/ui/calendar/lib/utils'
import { getWeekDays, normalizeDateLabel } from '@openloaf/ui/calendar/lib/utils/date-utils'

const CELL_CLASS = 'w-[calc((100%-4rem)/7)] min-w-[calc((100%-4rem)/7)] flex-1'
const LEFT_COL_WIDTH = 'w-10 sm:w-16 min-w-10 sm:min-w-16 max-w-10 sm:max-w-16'

const WeekView: React.FC = () => {
	const {
		t,
		currentDate,
		firstDayOfWeek,
		selectDate,
		openEventForm,
		currentLocale,
		timeFormat,
		businessHours,
		hideNonBusinessHours,
	} = useCalendarContext()

	const weekDays = useMemo(
		() => getWeekDays(currentDate, firstDayOfWeek),
		[currentDate, firstDayOfWeek]
	)

	const hours = useMemo(
		() =>
			getViewHours({
				referenceDate: currentDate,
				businessHours,
				hideNonBusinessHours,
				allDates: weekDays,
			}),
		[currentDate, businessHours, hideNonBusinessHours, weekDays]
	)

	const firstCol = {
		id: 'time-col',
		days: hours,
		day: currentDate,
		className: `shrink-0 ${LEFT_COL_WIDTH} sticky left-0 bg-background z-20`,
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

	// Generate week days
	const columns = useMemo(() => {
		return weekDays.map((day) => ({
			id: `day-col-${day.format('YYYY-MM-DD')}`,
			day,
			label: day.format('D'),
			className: CELL_CLASS,
			days: hours.map((h) =>
				day.hour(h.hour()).minute(0).second(0).millisecond(0)
			),
			value: day,
		}))
	}, [weekDays, hours])

	return (
		<VerticalGrid
			allDayRow={
				<AllDayRow
					classes={{ cell: CELL_CLASS, spacer: LEFT_COL_WIDTH }}
					days={weekDays}
				/>
			}
			classes={{ header: 'w-full h-18', body: 'h-[calc(100%-4.5rem)] w-full' }}
			columns={[firstCol, ...columns]}
			gridType="hour"
			variant="regular"
		>
			<div className={'flex h-full flex-1'} data-testid="week-view-header">
				{/* Corner cell with week number */}
				<div className="w-10 sm:w-16 h-full shrink-0 items-center justify-center border-r p-2 flex">
					<div className="flex flex-col items-center justify-center">
						<span className="text-muted-foreground text-xs">{t('week')}</span>
						<span className="font-medium">{currentDate.week()}</span>
					</div>
				</div>

				{/* Day header cells */}
				{weekDays.map((day) => {
					const isToday = day.isSame(dayjs(), 'day')

					return (
						<div
							className={cn(
								'hover:bg-accent/50 flex-1 flex flex-col justify-center cursor-pointer p-1 text-center sm:p-2 border-r last:border-r-0 w-50 h-full transition-colors',
								isToday && 'bg-primary/5 font-bold'
							)}
							data-testid={`week-day-header-${day.format('dddd').toLowerCase()}`}
							key={`week-day-header-${day.toISOString()}`}
							onClick={() => {
								selectDate(day)
								openEventForm({ start: day })
							}}
						>
							<div className="text-xs sm:text-sm text-muted-foreground">{day.format('ddd')}</div>
							<div
								className={cn(
									'mx-auto mt-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-xs',
									isToday && 'bg-primary text-primary-foreground'
								)}
							>
								{normalizeDateLabel(
									Intl.DateTimeFormat(currentLocale, {
										day: 'numeric',
									}).format(day.toDate())
								)}
							</div>
						</div>
					)
				})}
			</div>
		</VerticalGrid>
	)
}

export default WeekView
