import { Menu, PanelLeft, Plus } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { Button } from '@tenas-ai/ui/calendar/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@tenas-ai/ui/calendar/components/ui/popover'
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
	}))

	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
		if (view === 'year') {
			return now.isSame(currentDate, 'year')
		}
		return false
	}, [view, firstDayOfWeek, currentDate])

	const closeMobileMenu = () => setMobileMenuOpen(false)

	const NewEventButton = () => (
		<Button
			className="flex items-center gap-1"
			onClick={() => openEventForm()}
			size="sm"
			variant="default"
		>
			<Plus className="h-4 w-4" />
			<span className="hidden @4xl:inline">{t('new')}</span>
		</Button>
	)

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
					'flex justify-center @2xl/base-header:justify-between flex-wrap items-center gap-2',
					className,
					headerClassName
				)}
			>
				<div className="flex flex-wrap items-center justify-center gap-1 @2xl/base-header:justify-start">
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
					{!isTodayInView && (
						<Button onClick={today} size="sm" variant="outline">
							{t('today')}
						</Button>
					)}
				</div>

				<div className="flex flex-wrap justify-start @xl/base-header:justify-center gap-1 @4xl/base-header:justify-end overflow-x-auto">
					<div className="hidden @md/base-header:flex items-center justify-start gap-1">
						{headerLeadingSlot ? (
							<div className="flex items-center">{headerLeadingSlot}</div>
						) : null}
						<ViewControls
							className="justify-end"
							currentView={view}
							onChange={setView}
							onNext={nextPeriod}
							onPrevious={prevPeriod}
							variant="default"
						/>
						<NewEventButton />
					</div>

					<div className="flex items-center justify-end gap-1 @md/base-header:hidden">
						{headerLeadingSlot ? (
							<div className="flex items-center">{headerLeadingSlot}</div>
						) : null}
						<NewEventButton />
						<Popover onOpenChange={setMobileMenuOpen} open={mobileMenuOpen}>
							<PopoverTrigger asChild>
								<Button size="sm" variant="outline">
									<Menu className="h-4 w-4" />
								</Button>
							</PopoverTrigger>
							<PopoverContent align="end" className="w-[240px] p-2">
								<div className="space-y-2">
									<ViewControls
										currentView={view}
										onChange={(v) => {
											setView(v)
											closeMobileMenu()
										}}
										onNext={() => {
											nextPeriod()
											closeMobileMenu()
										}}
										onPrevious={() => {
											prevPeriod()
											closeMobileMenu()
										}}
										variant="grid"
									/>
								</div>
							</PopoverContent>
						</Popover>
					</div>
				</div>
			</div>
		</div>
	)
}

export default Header
