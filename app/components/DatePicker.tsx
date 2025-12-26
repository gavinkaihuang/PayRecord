'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from './Calendar';
import { GlassInput } from './ui';

interface DatePickerProps {
    date: Date | undefined;
    setDate: (date: Date | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function DatePicker({ date, setDate, placeholder = 'Pick a date', disabled = false }: DatePickerProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Close on click outside
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (selectedDate: Date | undefined) => {
        setDate(selectedDate);
        setIsOpen(false);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <div onClick={() => !disabled && setIsOpen(!isOpen)} className="cursor-pointer relative">
                <GlassInput
                    value={date ? format(date, 'yyyy-MM-dd') : ''}
                    placeholder={placeholder}
                    readOnly
                    className={`w-full cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            </div>

            {isOpen && !disabled && (
                <div className="absolute top-full left-0 z-50 mt-2">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={handleSelect}
                        initialFocus
                    />
                </div>
            )}
        </div>
    );
}
