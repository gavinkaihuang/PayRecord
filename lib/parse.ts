// Parse a user-supplied amount into a number.
// Treats undefined / null / '' as null (field not provided).
// Unlike `v ? parseFloat(v) : null` this preserves legitimate 0 values.
// Non-numeric input also yields null rather than NaN.
export function parseAmount(v: unknown): number | null {
    if (v === undefined || v === null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v as string);
    return Number.isNaN(n) ? null : n;
}

// "days ahead" query param for GET /api/bills/due: default 3, clamped to 0..90
// (0 = overdue + today's bills). Garbage input falls back to the default.
export function parseDueDays(v: string | null): number {
    const n = v === null ? NaN : parseInt(v, 10);
    if (Number.isNaN(n)) return 3;
    return Math.max(0, Math.min(90, n));
}
