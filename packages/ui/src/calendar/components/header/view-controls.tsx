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
import { Button } from '@openloaf/ui/calendar/components/ui/button'
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

const VIEW_CONFIG: { type: ViewType; icon: React.FC<{ className?: string }>; key: ViewType }[] = [
	{ type: 'month', icon: Calendar, key: 'month' },
	{ type: 'week', icon: Grid3x3, key: 'week' },
	{ type: 'day', icon: Clock, key: 'day' },
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
			{/* Desktop: button group */}
			<div
				className={cn(
					'hidden sm:flex items-center gap-1 rounded-lg border bg-background p-1',
					className
				)}
			>
				{VIEW_CONFIG.map(({ type, icon: Icon }) => (
					<Button
						className="h-7 px-2 gap-1"
						key={type}
						onClick={() => onChange(type)}
						size="sm"
						variant={currentView === type ? 'secondary' : 'ghost'}
					>
						<Icon className="h-3.5 w-3.5" />
						<span className="text-xs">{t(type)}</span>
					</Button>
				))}
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
