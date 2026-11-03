// Mask a credential for display: keep first/last 4 chars of long values,
// fully mask short ones. Telegram bot tokens are ASCII [0-9A-Za-z:_-], so
// the ellipsis/bullet markers below can never collide with a real value.
export function maskSecret(v: string | null | undefined): string | null {
    if (!v) return null;
    return v.length >= 12 ? `${v.slice(0, 4)}…${v.slice(-4)}` : '••••••••';
}

// True when a submitted value is just the masked echo of the stored secret.
// The settings form sends back what GET /api/users/profile displayed; treat
// that as "unchanged" instead of overwriting the stored credential with it.
export function isMaskedSecret(v: unknown): boolean {
    return typeof v === 'string' && (v.includes('…') || /^[•]+$/.test(v));
}
