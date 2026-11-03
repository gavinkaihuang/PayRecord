// Pure date helpers for "due" logic, fixed to the Asia/Shanghai calendar.
// Shared by the /api/bills/due route (TS import via allowJs) and the
// standalone cron script (require) - keep this file CommonJS, zero imports.
'use strict';

// Asia/Shanghai is UTC+8 year-round (no DST), so day boundaries are a fixed offset.
const SH_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar day (Y/M/D) of an instant as seen in Shanghai.
function shDayParts(d) {
    const shifted = new Date(d.getTime() + SH_OFFSET_MS); // SH wall clock expressed as UTC
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

// Instant of midnight (00:00:00 Shanghai time) of the day containing d.
function startOfShDay(d) {
    const { year, month, day } = shDayParts(d);
    return new Date(Date.UTC(year, month - 1, day) - SH_OFFSET_MS);
}

// Whole calendar days from `from` to `to` on the Shanghai calendar.
// Negative = `to` is in the past relative to `from`.
function shCalendarDaysBetween(from, to) {
    return Math.round((startOfShDay(to).getTime() - startOfShDay(from).getTime()) / DAY_MS);
}

// Last millisecond (instant) of the Shanghai day `days` after `now`.
// Upper bound for "due within N days" queries - pass to Prisma as `date: { lte }`.
function endOfShDayOffset(days, now) {
    return startOfShDay(now).getTime() + (days + 1) * DAY_MS - 1;
}

// YYYY-MM-DD of d's Shanghai day (display only, no server-TZ dependency).
function shDateString(d) {
    const { year, month, day } = shDayParts(d);
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

module.exports = { startOfShDay, shCalendarDaysBetween, endOfShDayOffset, shDateString };
