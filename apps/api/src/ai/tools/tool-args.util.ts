/** Аргументы инструмента приходят от модели как произвольный JSON — приводим безопасно. */

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

export function asInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
