import type { DayKey, WeeklyHours } from '../data/types';
import { toFaDigits } from './normalize';

/** Saturday-first week (DATA.md §5). */
export const WEEK: DayKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
export const DAY_FA: Record<DayKey, string> = {
  sat: 'شنبه',
  sun: 'یکشنبه',
  mon: 'دوشنبه',
  tue: 'سه‌شنبه',
  wed: 'چهارشنبه',
  thu: 'پنجشنبه',
  fri: 'جمعه',
};
const JS_TO_KEY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type HoursOverride = { closedToday?: boolean; hoursToday?: { start: string; end: string }[] | null };

/** Tehran wall-clock for an instant (no DST since 2022, but use Intl to be safe). */
export function tehranClock(t: number = Date.now()): { day: DayKey; minutes: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    day: JS_TO_KEY[wd < 0 ? 0 : wd],
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const minToHHMM = (m: number) => {
  const mm = ((m % 1440) + 1440) % 1440;
  return toFaDigits(`${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`);
};

type Shift = { start: number; end: number };
export type DayState = { status: 'open' | 'closed' | 'unknown'; shifts: Shift[] };

export function dayShifts(hours: WeeklyHours | null, day: DayKey, override?: HoursOverride, isToday = false): DayState {
  if (isToday && override?.closedToday) return { status: 'closed', shifts: [] };
  if (isToday && override?.hoursToday?.length)
    return { status: 'open', shifts: override.hoursToday.map((s) => ({ start: toMin(s.start), end: toMin(s.end) })) };
  if (!hours) return { status: 'unknown', shifts: [] };
  const d = hours[day];
  if (!d || d.status === 'unknown') return { status: 'unknown', shifts: [] };
  if (d.status === 'closed') return { status: 'closed', shifts: [] };
  return { status: 'open', shifts: d.shifts.map((s) => ({ start: toMin(s.start), end: toMin(s.end) })) };
}

export type OpenInfo = {
  /** true / false / null (unknown) */
  open: boolean | null;
  closesAt: number | null; // minutes of today
  nextOpen: { dayOffset: number; minutes: number } | null;
};

export function openInfo(hours: WeeklyHours | null, override?: HoursOverride, t: number = Date.now()): OpenInfo {
  const { day, minutes } = tehranClock(t);
  const today = dayShifts(hours, day, override, true);
  if (today.status === 'unknown' && !hours) return { open: null, closesAt: null, nextOpen: null };
  if (today.status === 'unknown') return { open: null, closesAt: null, nextOpen: null };
  const cur = today.shifts.find((s) => minutes >= s.start && minutes < s.end);
  if (cur) return { open: true, closesAt: cur.end, nextOpen: null };
  // next opening
  const later = today.shifts.filter((s) => s.start > minutes).sort((a, b) => a.start - b.start)[0];
  if (later) return { open: false, closesAt: null, nextOpen: { dayOffset: 0, minutes: later.start } };
  const idx = WEEK.indexOf(day);
  for (let off = 1; off <= 7; off++) {
    const d = WEEK[(idx + off) % 7];
    const st = dayShifts(hours, d);
    if (st.status === 'open' && st.shifts.length) {
      return { open: false, closesAt: null, nextOpen: { dayOffset: off, minutes: Math.min(...st.shifts.map((s) => s.start)) } };
    }
  }
  return { open: false, closesAt: null, nextOpen: null };
}

export const isOpenNow = (h: WeeklyHours | null, o?: HoursOverride, t?: number) => openInfo(h, o, t).open;
export const closesAt = (h: WeeklyHours | null, o?: HoursOverride, t?: number) => openInfo(h, o, t).closesAt;
export const nextOpenAt = (h: WeeklyHours | null, o?: HoursOverride, t?: number) => openInfo(h, o, t).nextOpen;

/** Will the shop be open at instant `at`? null = unknown. */
export function willBeOpenAt(hours: WeeklyHours | null, at: number, override?: HoursOverride, now: number = Date.now()): boolean | null {
  const sameDay = tehranClock(at).dateKey === tehranClock(now).dateKey;
  return openInfo(hours, sameDay ? override : undefined, at).open;
}

/** `باز · تا ۱۹:۰۰` / `بسته · فردا ۱۰:۰۰` / `ساعات نامشخص` */
export function todayLabel(hours: WeeklyHours | null, override?: HoursOverride, t: number = Date.now()): { text: string; tone: 'open' | 'closed' | 'unknown' } {
  const info = openInfo(hours, override, t);
  if (info.open === null) return { text: 'ساعات نامشخص', tone: 'unknown' };
  if (info.open) return { text: `باز · تا ${minToHHMM(info.closesAt!)}`, tone: 'open' };
  if (!info.nextOpen) return { text: 'بسته', tone: 'closed' };
  const { dayOffset, minutes } = info.nextOpen;
  const when =
    dayOffset === 0 ? 'امروز' : dayOffset === 1 ? 'فردا' : DAY_FA[WEEK[(WEEK.indexOf(tehranClock(t).day) + dayOffset) % 7]];
  return { text: `بسته · ${when} ${minToHHMM(minutes)}`, tone: 'closed' };
}

/** Short hour like "۲۱" for reason lines ("تا ۲۱ باز"). */
export function shortHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? minToHHMM(minutes) : toFaDigits(h === 24 ? 24 : h);
}

export function weekRows(hours: WeeklyHours | null, override?: HoursOverride, t: number = Date.now()) {
  const today = tehranClock(t).day;
  return WEEK.map((d) => {
    const st = dayShifts(hours, d, override, d === today);
    const text =
      st.status === 'unknown'
        ? 'ثبت نشده'
        : st.status === 'closed'
          ? 'تعطیل'
          : st.shifts.map((s) => `${minToHHMM(s.start)} تا ${minToHHMM(s.end)}`).join('، ');
    return { day: d, label: DAY_FA[d], text, isToday: d === today, status: st.status };
  });
}
