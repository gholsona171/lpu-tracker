export const TZ = 'America/Detroit';
const HOUR = 3600000;

function offsetMinutes(date, tz) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName').value; // "GMT-04:00" or "GMT"
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

export function localToUtc(dateStr, timeStr, tz = TZ) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  return new Date(guess.getTime() - offsetMinutes(guess, tz) * 60000);
}

export function checkinWindow(event) {
  const start = localToUtc(event.date, event.start);
  let end = localToUtc(event.date, event.end);
  if (end <= start) end = new Date(end.getTime() + 24 * HOUR);
  return { opens: new Date(start.getTime() - HOUR), closes: new Date(end.getTime() + 2 * HOUR) };
}

export function isOpen(event, now = new Date()) {
  const w = checkinWindow(event);
  return now >= w.opens && now <= w.closes;
}

export function todayLocal(now = new Date(), tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}
