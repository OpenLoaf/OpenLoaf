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
import { useResourceCalendarContext } from '@openloaf/ui/calendar/features/resource-calendar/contexts/resource-calendar-context'
import { ResourceMonthHorizontal } from './resource-month-horizontal'
import { ResourceMonthVertical } from './resource-month-vertical'

export const ResourceMonthView: React.FC = () => {
	const { orientation } = useResourceCalendarContext()

	if (orientation === 'vertical') {
		return <ResourceMonthVertical />
	}

	return <ResourceMonthHorizontal />
}
