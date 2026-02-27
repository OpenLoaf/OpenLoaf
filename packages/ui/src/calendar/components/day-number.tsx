/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type React from 'react'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@openloaf/ui/calendar/lib/utils'
import { normalizeDateLabel } from '@openloaf/ui/calendar/lib/utils/date-utils'

interface DayNumberProps {
	date: dayjs.Dayjs
	locale?: string
	className?: string
}

/**
 * Renders the day number for a calendar cell, highlighting 'today' with a primary background.
 */
export const DayNumber: React.FC<DayNumberProps> = ({
	date,
	locale = 'en',
	className,
}) => {
	const isToday = date.isSame(dayjs(), 'day')

	return (
		<div
			className={cn(
				'flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-xs shrink-0',
				isToday && 'bg-[#1a73e8] text-white font-medium dark:bg-sky-500',
				className
			)}
			data-testid={
				isToday ? 'day-number-today' : `day-number-${date.format('D')}`
			}
		>
			{normalizeDateLabel(
				Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date.toDate())
			)}
		</div>
	)
}
