import { AllDayRow } from '@tenas-ai/ui/calendar/components/all-day-row/all-day-row'
import { AnimatedSection } from '@tenas-ai/ui/calendar/components/animations/animated-section'
import { VerticalGrid } from '@tenas-ai/ui/calendar/components/vertical-grid/vertical-grid'
import { useCalendarContext } from '@tenas-ai/ui/calendar/features/calendar/contexts/calendar-context/context'
import { getViewHours } from '@tenas-ai/ui/calendar/features/calendar/utils/view-hours'
import dayjs from '@tenas-ai/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'
import { formatFullDate } from '@tenas-ai/ui/calendar/lib/utils/date-utils'

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
			'shrink-0 w-16 min-w-16 max-w-16 sticky left-0 bg-background z-20',
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
				<div className="text-muted-foreground p-2 text-right text-[10px] sm:text-xs flex flex-col items-center">
					{label}
				</div>
			)
		},
	}

	const columns = {
		id: `day-col-${currentDate.format('YYYY-MM-DD')}`,
		day: currentDate,
		days: hours,
		className: 'w-[calc(100%-4rem)] flex-1',
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
				<AnimatedSection
					className={cn(
						'flex justify-center items-center text-center text-base font-semibold sm:text-xl',
						isToday && 'text-primary'
					)}
					transitionKey={currentDate.format('YYYY-MM-DD')}
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
				</AnimatedSection>
			</div>
		</VerticalGrid>
	)
}

export default DayView
