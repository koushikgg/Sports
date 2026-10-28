'use client';
import { useEffect, useState } from 'react';

/** The viewer's current time, refreshed on an interval. null until mounted so server HTML stays stable. */
export function useNow(intervalMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

export const isToday = (iso: string | null, now: Date) => !!iso && dayDiff(new Date(iso), now) === 0;

/** Monday-to-Sunday week containing `now`, in the viewer's timezone. */
export function inThisWeek(iso: string | null, now: Date) {
  if (!iso) return false;
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const t = new Date(iso).getTime();
  return t >= monday.getTime() && t < monday.getTime() + 7 * 86_400_000;
}

const hhmm = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const shortDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Badge for a scheduled match: TODAY, TOMORROW or the date. */
export function dayBadge(iso: string | null, now: Date | null): string {
  if (!iso) return 'SCHEDULED';
  if (!now) return 'UPCOMING';
  const diff = dayDiff(new Date(iso), now);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return shortDate(new Date(iso)).toUpperCase();
}

/** "Starts in 45 min", "Starts in 2h 15m", "Tomorrow · 09:30", "Thu 29 Oct · 09:30". */
export function kickoffLine(iso: string | null, now: Date | null): string {
  if (!iso) return 'Time to be confirmed';
  if (!now) return '';
  const when = new Date(iso);
  const mins = Math.round((when.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return 'Starting soon';
  if (mins < 60) return `Starts in ${mins} min`;
  const diff = dayDiff(when, now);
  if (diff === 0) return `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${diff === 1 ? 'Tomorrow' : shortDate(when)} · ${hhmm(when)}`;
}

export const todayLabel = (now: Date) =>
  `${now.toLocaleDateString(undefined, { weekday: 'long' })} · ${now.getDate()} ${now.toLocaleDateString(undefined, { month: 'short' })} ${now.getFullYear()}`.toUpperCase();
