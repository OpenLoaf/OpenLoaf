import { ChevronLeft, ChevronRight } from 'lucide-react'
import type React from 'react'
import { Button } from '@tenas-ai/ui/calendar/components/ui/button'
import { useSmartCalendarContext } from '@tenas-ai/ui/calendar/hooks/use-smart-calendar-context'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@tenas-ai/ui/tabs'

type ViewType = 'day' | 'week' | 'month' | 'year'
const AVAILABLE_VIEWS: ViewType[] = ['day', 'week', 'month', 'year']

interface ViewControlsProps {
	currentView: ViewType
	onChange: (view: ViewType) => void
	onNext?: () => void
	onPrevious?: () => void
	variant?: 'default' | 'grid'
	size?: 'sm' | 'default'
	className?: string
}

const ViewControls: React.FC<ViewControlsProps> = ({
	currentView,
	onChange,
	variant = 'default',
	size = 'sm',
	className,
	onNext,
	onPrevious,
}) => {
	const { t, resources } = useSmartCalendarContext((context) => ({
		t: context.t,
		resources: context.resources,
	}))
	const isGrid = variant === 'grid'
	const isResourceCalendar = resources && resources.length > 0

	const tabsListClassName = cn(
		isGrid
			? 'grid grid-cols-2 gap-2 h-auto w-full bg-transparent p-0'
			: 'h-8 w-fit p-[2px]'
	)

	return (
		<div
			className={cn(
				isGrid ? 'grid grid-cols-2 gap-2' : 'flex gap-1',
				className
			)}
		>
			<Button onClick={onPrevious} size={size} variant="outline">
				<ChevronLeft className="h-4 w-4" />
			</Button>
			<Button onClick={onNext} size={size} variant="outline">
				<ChevronRight className="h-4 w-4" />
			</Button>

			<Tabs
				className={cn(isGrid ? 'col-span-2' : '')}
				onValueChange={(value) => {
					onChange(value as ViewType)
				}}
				value={currentView}
			>
				<TabsList className={tabsListClassName}>
					{AVAILABLE_VIEWS.map((type: ViewType) => {
						if (isResourceCalendar && type === 'year') {
							return null
						}

						return (
							<TabsTrigger
								className={cn(
									isGrid ? 'w-full h-8' : 'h-full px-2'
								)}
								key={type}
								value={type}
							>
								{t(type)}
							</TabsTrigger>
						)
					})}
				</TabsList>
			</Tabs>
		</div>
	)
}

export default ViewControls
