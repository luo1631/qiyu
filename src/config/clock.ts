export const visitorTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const formatters = new Map<string, Intl.DateTimeFormat>();
export interface CivilTime { year: number; month: number; day: number; hour: number; minute: number; second: number; key: string }
export function civilTime(date: Date, timeZone = visitorTimeZone()): CivilTime {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  const fields = Object.fromEntries(formatter.formatToParts(date)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const { year, month, day, hour, minute, second } = fields;
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, hour, minute, second, key };
}

export function utcOffsetMinutes(date: Date, timeZone: string) {
  const time = civilTime(date, timeZone);
  const localEpoch = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  return (localEpoch - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}
