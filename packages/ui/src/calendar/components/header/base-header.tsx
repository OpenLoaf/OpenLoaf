/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { ChevronLeft, ChevronRight, PanelLeft, Plus } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { Button } from '@openloaf/ui/calendar/components/ui/button'
import { useSmartCalendarContext } from '@openloaf/ui/calendar/hooks/use-smart-calendar-context'
import { cn } from '@openloaf/ui/calendar/lib/utils'
import { getMonthWeeks, getWeekDays } from '@openloaf/ui/calendar/lib/utils/date-utils'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
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
		hideNewEventButton,
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
		hideNewEventButton: ctx.hideNewEventButton,
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
					<button
						type="button"
						aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
						aria-pressed={isSidebarOpen}
						className={cn(
							'h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors duration-150',
							isSidebarOpen
								? 'bg-[#f3e8fd] text-[#9334e6] dark:bg-violet-900/40 dark:text-violet-300'
								: 'text-[#9334e6] hover:bg-[#f3e8fd] dark:text-violet-300 dark:hover:bg-violet-900/40',
							!sidebar && 'opacity-50 pointer-events-none'
						)}
						disabled={!sidebar}
						onClick={() => {
							if (!sidebar) {
								return
							}
							toggleSidebar()
						}}
					>
						<PanelLeft
							className={cn(
								'h-4 w-4 transition-transform duration-200',
								!isSidebarOpen ? 'rotate-180' : ''
							)}
						/>
					</button>
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

				{/* Right section: view controls + leading slot + new event */}
				<div className="flex items-center gap-2">
					{hideViewControls ? null : (
						<ViewControls
							currentView={view}
							onChange={setView}
						/>
					)}
					{headerLeadingSlot ? (
						<div className="flex items-center">{headerLeadingSlot}</div>
					) : null}
					{hideNewEventButton ? null : (
					<button
						type="button"
						className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70 shadow-none transition-colors duration-150"
						onClick={() => openEventForm()}
					>
						<Plus className="h-4 w-4" />
						<span className="hidden @xl/base-header:inline">{t('new')}</span>
					</button>
				)}
				</div>
			</div>
		</div>
	)
}

export default Header
