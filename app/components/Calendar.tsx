'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-day-picker/dist/style.css';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={`p-3 glass-panel bg-slate-900/95 shadow-2xl ${className || ''}`}
            classNames={{
                months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                month: 'space-y-4 text-white',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-sm font-medium',
                nav: 'space-x-1 flex items-center',
                button_previous: 'absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-white',
                button_next: 'absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-white',
                month_grid: 'w-full border-collapse space-y-1',
                weekdays: 'flex',
                weekday: 'text-white/50 rounded-md w-9 font-normal text-[0.8rem]',
                week: 'flex w-full mt-2',
                day: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-indigo-500/50 [&:has([aria-selected])]:bg-indigo-500/50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                day_button: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-white/10 rounded-md text-white border-0 bg-transparent',
                range_end: 'day-range-end',
                today: 'bg-white/10 text-white',
                outside: 'text-white/30 opacity-50',
                disabled: 'text-white/30 opacity-50',
                range_middle: 'aria-selected:bg-indigo-500/50 aria-selected:text-white',
                hidden: 'invisible',
                ...classNames,
            }}
            modifiersClassNames={{
                selected: 'bg-indigo-500 text-white hover:bg-indigo-500 hover:text-white focus:bg-indigo-500 focus:text-white',
            }}
            components={{
                Chevron: ({ orientation }) => {
                    if (orientation === "left") return <ChevronLeft className="h-4 w-4" />;
                    if (orientation === "right") return <ChevronRight className="h-4 w-4" />;
                    // Fallback or up/down if ever used
                    return <ChevronDown className="h-4 w-4" />;
                }
            }}
            {...props}
        />
    );
}
