/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'

/**
 * Calculates the week days for a given date and first day of week setting.
 *
 * This function ensures that the current date is always included in the returned week,
 * even when the first day of week is set to a day after the current date.
 *
 * @param currentDate - The reference date for calculating the week
 * @param firstDayOfWeek - The day number (0-6) representing the first day of the week (0 = Sunday, 1 = Monday, etc.)
 * @returns An array of 7 dayjs objects representing the week days, starting from firstDayOfWeek
 *
 * @example
 * // Get week starting from Monday for current date
 * const weekDays = getWeekDays(dayjs('2025-10-13'), 1)
 * // Returns: [Mon Oct 13, Tue Oct 14, ..., Sun Oct 19]
 *
 * @example
 * // Get week starting from Wednesday when current date is Monday
 * const weekDays = getWeekDays(dayjs('2025-10-13'), 3)
 * // Returns: [Wed Oct 8, Thu Oct 9, ..., Tue Oct 14] (includes Monday Oct 13)
 */
export function getWeekDays(
	currentDate: dayjs.Dayjs,
	firstDayOfWeek: number
): dayjs.Dayjs[] {
	const startOfWeekFromCurrentDate = currentDate
		.startOf('week')
		.day(firstDayOfWeek)

	const adjustedStartOfWeek = currentDate.isBefore(startOfWeekFromCurrentDate)
		? startOfWeekFromCurrentDate.subtract(1, 'week')
		: startOfWeekFromCurrentDate

	return Array.from({ length: 7 }, (_, dayIndex) =>
		adjustedStartOfWeek.add(dayIndex, 'day')
	)
}

/**
 * Generates 6 weeks of days for a month calendar view.
 * Always returns 42 days (6 weeks × 7 days).
 */
export function getMonthWeeks(
	monthDate: dayjs.Dayjs,
	firstDayOfWeek: number
): dayjs.Dayjs[][] {
	const firstWeek = getWeekDays(monthDate.startOf('month'), firstDayOfWeek)

	return Array.from({ length: 6 }, (_, weekIndex) => {
		const weekStart = firstWeek[0].add(weekIndex, 'week')
		return getWeekDays(weekStart, firstDayOfWeek)
	})
}

export function getMonthDays(monthDate: dayjs.Dayjs): dayjs.Dayjs[] {
	const daysInMonth = monthDate.daysInMonth()
	return Array.from({ length: daysInMonth }, (_, i) =>
		monthDate.startOf('month').add(i, 'day')
	)
}

/**
 * Normalizes locale-formatted date labels for UI display.
 *
 * Removes the trailing "日" suffix for Chinese locales while keeping weekday names intact.
 */
export function normalizeDateLabel(value: string): string {
	// 逻辑：只保留日期中的数字，去掉所有后缀（如 日 / 일 / 日 / .）。
	const match = value.match(/[\p{Number}]+/u)
	return match ? match[0] : value
}

/**
 * Formats a full date string for display with locale-specific ordering.
 */
export function formatFullDate(
	date: dayjs.Dayjs,
	locale?: string,
	fallbackFormat = 'MMMM D, YYYY'
): string {
	if (!locale) {
		return date.format(fallbackFormat)
	}
	const normalizedLocale = locale.toLowerCase()
	if (normalizedLocale.startsWith('zh')) {
		// 逻辑：中文日期顺序使用 年月日。
		return date.format('YYYY年M月D日')
	}
	return date.format(fallbackFormat)
}

interface GetDayHoursOptions {
	referenceDate?: dayjs.Dayjs // Reference date to set the hours on (default is today)
	length?: number // Number of hours in the day (default is 24)
}

export function getDayHours({
	referenceDate = dayjs(),
	length = 24,
}: GetDayHoursOptions = {}): dayjs.Dayjs[] {
	return Array.from({ length }, (_, i) =>
		referenceDate.hour(i).minute(0).second(0).millisecond(0)
	)
}
