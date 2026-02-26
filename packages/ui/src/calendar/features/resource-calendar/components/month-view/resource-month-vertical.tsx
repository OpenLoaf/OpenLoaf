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
import { ResourceCell } from '@openloaf/ui/calendar/components/resource-cell'
import { VerticalGrid } from '@openloaf/ui/calendar/components/vertical-grid/vertical-grid'
import { useResourceCalendarContext } from '@openloaf/ui/calendar/features/resource-calendar/contexts/resource-calendar-context'
import type dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'

export const ResourceMonthVertical: React.FC = () => {
	const { currentDate, getVisibleResources } = useResourceCalendarContext()

	const resources = getVisibleResources()
	const startOfMonth = currentDate.startOf('month')
	const daysInMonth = Array.from(
		{ length: currentDate.daysInMonth() },
		(_, i) => startOfMonth.add(i, 'day')
	)
	const anchorDay = daysInMonth[0] ?? currentDate

	const firstCol = {
		id: 'date-col',
		days: daysInMonth,
		day: anchorDay,
		className:
			'shrink-0 w-16 min-w-16 max-w-16 sticky left-0 bg-background z-20',
		gridType: 'day' as const,
		noEvents: true,
		renderCell: (date: dayjs.Dayjs) => (
			<div className="text-muted-foreground p-2 text-right text-[10px] sm:text-xs flex flex-col items-center">
				<span>{date.format('D')}</span>
				<span>{date.format('ddd')}</span>
			</div>
		),
	}

	const columns = resources.map((resource) => ({
		id: `month-col-resource-${resource.id}`,
		day: anchorDay,
		resourceId: resource.id,
		days: daysInMonth,
		gridType: 'day' as const,
	}))

	return (
		<VerticalGrid
			classes={{ header: 'w-full', body: 'w-full' }}
			columns={[firstCol, ...columns]}
			data-testid="resource-month-vertical-grid"
		>
			{/* Header */}
			<div
				className={'flex border-b h-12 flex-1'}
				data-testid="resource-month-header"
			>
				<div className="shrink-0 border-r w-16 sticky top-0 left-0 bg-background z-20" />
				{resources.map((resource) => (
					<ResourceCell
						className="min-w-50 flex-1"
						key={`resource-cell-${resource.id}`}
						resource={resource}
					/>
				))}
			</div>
		</VerticalGrid>
	)
}
