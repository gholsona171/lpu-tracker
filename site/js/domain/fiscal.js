// fyEnd is 'MM-DD'. A fiscal year is labeled by the calendar year it ends in.
export function fiscalYearFor(dateStr, fyEnd = '12-31') {
  const [m, d] = fyEnd.split('-').map(Number);
  const [y, mm, dd] = dateStr.slice(0, 10).split('-').map(Number);
  return mm > m || (mm === m && dd > d) ? y + 1 : y;
}

export function fiscalYearRange(fy, fyEnd = '12-31') {
  const [m, d] = fyEnd.split('-').map(Number);
  const start = new Date(Date.UTC(fy - 1, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start, end: `${fy}-${fyEnd}` };
}
