/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Calendar, Clock, Grid3x3 } from 'lucide-react'
import type React from 'react'
import { useSmartCalendarContext } from '@openloaf/ui/calendar/hooks/use-smart-calendar-context'
import { cn } from '@openloaf/ui/calendar/lib/utils'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@openloaf/ui/calendar/components/ui/select'

type ViewType = 'day' | 'week' | 'month'

interface ViewControlsProps {
	currentView: ViewType
	onChange: (view: ViewType) => void
	className?: string
}

const VIEW_CONFIG: {
	type: ViewType
	icon: React.FC<{ className?: string }>
	activeBg: string
	activeText: string
	darkActiveBg: string
	darkActiveText: string
}[] = [
	{
		type: 'month',
		icon: Calendar,
		activeBg: 'bg-[#e8f0fe]',
		activeText: 'text-[#1a73e8]',
		darkActiveBg: 'dark:bg-sky-900/50',
		darkActiveText: 'dark:text-sky-300',
	},
	{
		type: 'week',
		icon: Grid3x3,
		activeBg: 'bg-[#f3e8fd]',
		activeText: 'text-[#9334e6]',
		darkActiveBg: 'dark:bg-violet-900/40',
		darkActiveText: 'dark:text-violet-300',
	},
	{
		type: 'day',
		icon: Clock,
		activeBg: 'bg-[#fef7e0]',
		activeText: 'text-[#e37400]',
		darkActiveBg: 'dark:bg-amber-900/40',
		darkActiveText: 'dark:text-amber-300',
	},
]

const ViewControls: React.FC<ViewControlsProps> = ({
	currentView,
	onChange,
	className,
}) => {
	const { t } = useSmartCalendarContext((context) => ({
		t: context.t,
	}))

	return (
		<>
			{/* Desktop: segmented control */}
			<div
				className={cn(
					'hidden sm:flex items-center gap-0.5 rounded-full border bg-background p-0.5',
					className
				)}
			>
				{VIEW_CONFIG.map(({ type, icon: Icon, activeBg, activeText, darkActiveBg, darkActiveText }) => {
					const isActive = currentView === type
					return (
						<button
							type="button"
							className={cn(
								'inline-flex items-center justify-center rounded-full transition-all duration-150',
								isActive
									? `h-7 gap-1 px-2.5 ${activeBg} ${activeText} ${darkActiveBg} ${darkActiveText}`
									: 'h-7 w-7 text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124] dark:text-slate-400 dark:hover:bg-[hsl(var(--muted)/0.42)] dark:hover:text-slate-200'
							)}
							key={type}
							onClick={() => onChange(type)}
							aria-label={t(type)}
						>
							<Icon className="h-3.5 w-3.5" />
							{isActive && (
								<span className="text-xs font-medium">{t(type)}</span>
							)}
						</button>
					)
				})}
			</div>

			{/* Mobile: select dropdown */}
			<div className="sm:hidden">
				<Select
					onValueChange={(value) => onChange(value as ViewType)}
					value={currentView}
				>
					<SelectTrigger className="h-8 w-24 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{VIEW_CONFIG.map(({ type }) => (
							<SelectItem key={type} value={type}>
								{t(type)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</>
	)
}

export default ViewControls
