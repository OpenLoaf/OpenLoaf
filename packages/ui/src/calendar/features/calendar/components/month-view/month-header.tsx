import type React from 'react'
import { AnimatedSection } from '@tenas-ai/ui/calendar/components/animations/animated-section'
import { useCalendarContext } from '@tenas-ai/ui/calendar/features/calendar/contexts/calendar-context/context'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'
import { getWeekDays } from '@tenas-ai/ui/calendar/lib/utils/date-utils'

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
			{weekDays.map((weekDay, index) => (
				<AnimatedSection
					className="py-2 text-center font-medium border-r last:border-r-0 border-b flex-1"
					data-testid={`weekday-header-${weekDay.format('ddd').toLowerCase()}`}
					direction="fade"
					delay={index * 0.05}
					key={weekDay.toISOString()}
					transitionKey={weekDay.toISOString()}
				>
					<span className="text-sm capitalize">{weekDay.format('ddd')}</span>
				</AnimatedSection>
			))}
		</div>
	)
}
