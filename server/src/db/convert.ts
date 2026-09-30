// Postgres BIGINT columns (epoch ms) come back as bigint; the app works in plain numbers.
export const ms = (v: bigint): number => Number(v);
export const msOrNull = (v: bigint | null): number | null => (v === null ? null : Number(v));
