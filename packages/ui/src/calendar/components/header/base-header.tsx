import { ChevronLeft, ChevronRight, PanelLeft, Plus } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { Button } from '@tenas-ai/ui/calendar/components/ui/button'
import { useSmartCalendarContext } from '@tenas-ai/ui/calendar/hooks/use-smart-calendar-context'
import { cn } from '@tenas-ai/ui/calendar/lib/utils'
import { getMonthWeeks, getWeekDays } from '@tenas-ai/ui/calendar/lib/utils/date-utils'
import dayjs from '@tenas-ai/ui/calendar/lib/configs/dayjs-config'
import TitleContent from './title-content'
import ViewControls from './view-controls'

interface HeaderProps {
	className?: string
}

const Header: React.FC<HeaderProps> = ({ className = '' }) => {
	const {
		view,
		setView,
		nextPeriod,
		prevPeriod,
		today,
		openEventForm,
		headerComponent,
		headerLeadingSlot,
		headerClassName,
		sidebar,
		isSidebarOpen,
		toggleSidebar,
		t,
		firstDayOfWeek,
		currentDate,
		hideViewControls,
	} = useSmartCalendarContext((ctx) => ({
		view: ctx.view,
		setView: ctx.setView,
		nextPeriod: ctx.nextPeriod,
		prevPeriod: ctx.prevPeriod,
		today: ctx.today,
		openEventForm: ctx.openEventForm,
		headerComponent: ctx.headerComponent,
		headerLeadingSlot: ctx.headerLeadingSlot,
		headerClassName: ctx.headerClassName,
		sidebar: ctx.sidebar,
		isSidebarOpen: ctx.isSidebarOpen,
		toggleSidebar: ctx.toggleSidebar,
		t: ctx.t,
		firstDayOfWeek: ctx.firstDayOfWeek,
		currentDate: ctx.currentDate,
		hideViewControls: ctx.hideViewControls,
	}))

	const isTodayInView = useMemo(() => {
		const now = dayjs()
		if (view === 'day') {
			return now.isSame(currentDate, 'day')
		}
		if (view === 'week') {
			return getWeekDays(currentDate, firstDayOfWeek).some((day) =>
				day.isSame(now, 'day')
			)
		}
		if (view === 'month') {
			const weeks = getMonthWeeks(currentDate, firstDayOfWeek)
			return weeks.flat().some((day) => day.isSame(now, 'day'))
		}
		return false
	}, [view, firstDayOfWeek, currentDate])

	if (headerComponent) {
		return headerComponent
	}

	return (
		<div
			className="@container/base-header w-full"
			data-testid="calendar-header"
		>
			<div
				className={cn(
					'flex justify-between items-center gap-2',
					className,
					headerClassName
				)}
			>
				{/* Left section: sidebar toggle + title + nav */}
				<div className="flex items-center gap-1">
					<Button
						aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
						aria-pressed={isSidebarOpen}
						className="h-7 w-7"
						disabled={!sidebar}
						onClick={() => {
							if (!sidebar) {
								return
							}
							toggleSidebar()
						}}
						size="icon"
						variant="ghost"
					>
						<PanelLeft
							className={cn(
								'h-4 w-4 transition-transform duration-200',
								!isSidebarOpen ? 'rotate-180' : '',
								sidebar ? '' : 'opacity-50'
							)}
						/>
					</Button>
					<TitleContent />
					<Button
						className="h-7 w-7"
						onClick={prevPeriod}
						size="icon"
						variant="ghost"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					{!isTodayInView && (
						<Button className="h-7" onClick={today} size="sm" variant="outline">
							{t('today')}
						</Button>
					)}
					<Button
						className="h-7 w-7"
						onClick={nextPeriod}
						size="icon"
						variant="ghost"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>

				{/* Right section: leading slot + view controls + new event */}
				<div className="flex items-center gap-2">
					{headerLeadingSlot ? (
						<div className="flex items-center">{headerLeadingSlot}</div>
					) : null}
					{hideViewControls ? null : (
						<ViewControls
							currentView={view}
							onChange={setView}
						/>
					)}
					<Button
						className="flex items-center gap-1"
						onClick={() => openEventForm()}
						size="sm"
						variant="default"
					>
						<Plus className="h-4 w-4" />
						<span className="hidden @xl/base-header:inline">{t('new')}</span>
					</Button>
				</div>
			</div>
		</div>
	)
}

export default Header
