// Parse a user-supplied amount into a number.
// Treats undefined / null / '' as null (field not provided).
// Unlike `v ? parseFloat(v) : null` this preserves legitimate 0 values.
// Non-numeric input also yields null rather than NaN.
export function parseAmount(v: unknown): number | null {
    if (v === undefined || v === null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v as string);
    return Number.isNaN(n) ? null : n;
}
