import { memo } from 'react'
import { useSmartCalendarContext } from '@openloaf/ui/calendar/hooks/use-smart-calendar-context'
import { cn } from '@openloaf/ui/calendar/lib/utils'

interface AllDayCellProps {
	className?: string
}

const NoMemoAllDayCell: React.FC<AllDayCellProps> = ({ className }) => {
	const { t } = useSmartCalendarContext((state) => ({ t: state.t }))
	return (
		<div
			className={cn(
				'w-16 border-r shrink-0 sticky left-0 bg-background z-20 flex items-center justify-center text-[10px] sm:text-xs text-muted-foreground',
				className
			)}
		>
			{t('allDay')}
		</div>
	)
}

export const AllDayCell = memo(NoMemoAllDayCell)
