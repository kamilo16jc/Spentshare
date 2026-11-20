// SpentShare — dates for automatic charges and recurring expenses (pure, no Firebase).
// Everything is computed on the America/Chicago calendar; runs happen at 08:00 Chicago.
//
// Rule shape (autoCharges / recurring): { frequency: 'weekly'|'biweekly'|'monthly', day }
//   weekly   -> day = ISO weekday (1 = Monday … 7 = Sunday)
//   biweekly -> day ignored: the 1st and the 15th of every month
//   monthly  -> day of month (1..28 in the app); months that are shorter use their last day
'use strict';

const TZ = 'America/Chicago';
const RUN_HOUR = 8;

const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
});

// Wall-clock parts of an instant in Chicago
function zoneParts(date) {
  const p = {};
  FMT.formatToParts(date).forEach((x) => { if (x.type !== 'literal') p[x.type] = Number(x.value); });
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, min: p.minute, s: p.second };
}

// Chicago offset (local - UTC) in ms at an instant
function offsetMs(date) {
  const p = zoneParts(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant of y-m-d hh:mm on the Chicago wall clock
function zonedDate(y, m, d, h = RUN_HOUR, min = 0) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offsetMs(new Date(guess));
  t = guess - offsetMs(new Date(t));   // second pass settles DST changes
  return new Date(t);
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isoWeekday = (y, m, d) => ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' (Chicago) of an instant
function dayKey(date) {
  const p = zoneParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
// 'YYYYMMDD' (Chicago) of an instant
const compactKey = (date) => dayKey(date).replace(/-/g, '');

function isDueOn(rule, y, m, d) {
  const f = rule && rule.frequency;
  const day = Math.round(Number(rule && rule.day)) || 1;
  if (f === 'weekly') return isoWeekday(y, m, d) === Math.min(7, Math.max(1, day));
  if (f === 'biweekly') return d === 1 || d === 15;
  if (f === 'monthly') return d === Math.min(Math.min(31, Math.max(1, day)), daysInMonth(y, m));
  return false;
}

// Is the Chicago calendar day of `now` a run day for this rule?
function isDueToday(rule, now) {
  const p = zoneParts(now);
  return isDueOn(rule, p.y, p.m, p.d);
}

// Next run (08:00 Chicago on a due day) strictly after `after`; null for an unknown frequency
function nextOccurrence(rule, after) {
  const p = zoneParts(after);
  let cur = Date.UTC(p.y, p.m - 1, p.d);
  for (let i = 0; i < 400; i++, cur += 86400000) {
    const c = new Date(cur);
    const y = c.getUTCFullYear();
    const m = c.getUTCMonth() + 1;
    const d = c.getUTCDate();
    if (!isDueOn(rule, y, m, d)) continue;
    const at = zonedDate(y, m, d, RUN_HOUR, 0);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}

module.exports = {
  TZ, RUN_HOUR, zoneParts, zonedDate, dayKey, compactKey,
  isDueOn, isDueToday, nextOccurrence, isoWeekday, daysInMonth,
};
