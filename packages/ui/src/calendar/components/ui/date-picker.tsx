/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { PopoverClose } from '@radix-ui/react-popover'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Matcher } from 'react-day-picker'
import { Button } from '@openloaf/ui/calendar/components/ui/button'
import { Calendar } from '@openloaf/ui/calendar/components/ui/calendar'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@openloaf/ui/calendar/components/ui/popover'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import { cn } from '@openloaf/ui/calendar/lib/utils'

interface DatePickerProps {
	date: Date | undefined
	onChange?: (date: Date | undefined) => void
	label?: string
	className?: string
	closeOnSelect?: boolean
	disabled?: Matcher | Matcher[]
}

export function DatePicker({
	date,
	closeOnSelect,
	onChange,
	label = 'Pick a date',
	className,
	disabled,
}: DatePickerProps) {
	const popOverRef = useRef<HTMLButtonElement | null>(null)
	const [selectedDate, setSelectedDate] = useState<Date | undefined>(date)

	// Sync date state with date prop
	useEffect(() => {
		setSelectedDate(date)
	}, [date])

	const handleDateSelect = (date: Date | undefined) => {
		setSelectedDate(date)
		if (closeOnSelect) {
			popOverRef.current?.click()
		}
		onChange?.(date)
	}

	return (
		<div className={className}>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						className={cn(
							'data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal'
						)}
						data-empty={!date}
						variant="outline"
					>
						<CalendarIcon />
						{selectedDate ? (
							dayjs(selectedDate).format('MMM D, YYYY')
						) : (
							<span>{label}</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-0">
					<PopoverClose ref={popOverRef} />
					<Calendar
						captionLayout="dropdown"
						defaultMonth={selectedDate}
						disabled={disabled}
						mode="single"
						onSelect={handleDateSelect}
						selected={selectedDate}
					/>
				</PopoverContent>
			</Popover>
		</div>
	)
}
