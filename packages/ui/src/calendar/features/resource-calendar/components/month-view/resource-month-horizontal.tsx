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
import { useMemo } from 'react'
import { AnimatedSection } from '@openloaf/ui/calendar/components/animations/animated-section'
import { ResourceEventGrid } from '@openloaf/ui/calendar/features/resource-calendar/components/resource-event-grid'
import { useResourceCalendarContext } from '@openloaf/ui/calendar/features/resource-calendar/contexts/resource-calendar-context'
import type dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { getMonthDays } from '@openloaf/ui/calendar/lib/utils/date-utils'

export const ResourceMonthHorizontal: React.FC = () => {
	const { currentDate, t } = useResourceCalendarContext()

	// Generate calendar grid - days of the month
	const monthDays = useMemo<dayjs.Dayjs[]>(() => {
		return getMonthDays(currentDate)
	}, [currentDate])

	return (
		<ResourceEventGrid days={monthDays}>
			<div className="w-20 sm:w-40 border-b border-r shrink-0 flex justify-center items-center sticky top-0 left-0 bg-background z-20">
				<div className="text-sm">{t('resources')}</div>
			</div>

			{monthDays.map((day, index) => {
				const key = `resource-month-header-${day.toISOString()}`

				return (
					<AnimatedSection
						className="w-20 border-b border-r shrink-0 flex items-center justify-center flex-col"
						direction="fade"
						delay={index * 0.05}
						key={`${key}-animated`}
						transitionKey={`${key}-motion`}
					>
						<div className="text-xs font-medium">{day.format('D')}</div>
						<div className="text-xs text-muted-foreground">
							{day.format('ddd')}
						</div>
					</AnimatedSection>
				)
			})}
		</ResourceEventGrid>
	)
}
