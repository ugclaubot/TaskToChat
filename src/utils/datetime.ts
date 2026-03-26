const INDIA_TIMEZONE = 'Asia/Kolkata';

function toDateParts(date: Date, timeZone: string = INDIA_TIMEZONE): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return { year, month, day };
}

function parseSqliteUtcDate(value: string): Date {
  return new Date(value.replace(' ', 'T') + 'Z');
}

export function formatTaskAgeLabel(createdAt?: string, timeZone: string = INDIA_TIMEZONE): string {
  if (!createdAt) return '';

  const created = parseSqliteUtcDate(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  const createdParts = toDateParts(created, timeZone);
  const nowParts = toDateParts(new Date(), timeZone);

  const createdUtcMidnight = Date.UTC(createdParts.year, createdParts.month - 1, createdParts.day);
  const nowUtcMidnight = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  const diffDays = Math.max(0, Math.floor((nowUtcMidnight - createdUtcMidnight) / 86400000));

  const createdDateLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).format(created);

  if (diffDays === 0) return 'created today';
  if (diffDays === 1) return `created ${createdDateLabel} · 1d ago`;
  return `created ${createdDateLabel} · ${diffDays}d ago`;
}
