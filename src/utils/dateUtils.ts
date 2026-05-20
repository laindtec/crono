const ISO_DATE_LENGTH = 10;

export const BASE_WEEK_START = "2026-05-18";

export function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function differenceInDays(date: Date, baseDate: Date): number {
  const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const utcBase = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  return Math.round((utcDate - utcBase) / 86_400_000);
}

export function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

export function getTodayISODate(): string {
  return toISODate(new Date());
}

export function getDateFromTodayOffset(dayOffset: number): string {
  return toISODate(addDays(new Date(), Math.max(0, dayOffset)));
}

export function getCurrentWeekOffset(): number {
  const currentMonday = getMonday(new Date());
  const baseMonday = parseLocalDate(BASE_WEEK_START);
  return Math.round(differenceInDays(currentMonday, baseMonday) / 7);
}

export function formatDayName(date: string): string {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(parseLocalDate(date));
}

export function formatDayHeading(date: string): string {
  const parsedDate = parseLocalDate(date);
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(parsedDate);
  const month = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(parsedDate);
  const capitalizedWeekday = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;

  return `${capitalizedWeekday} ${parsedDate.getDate()} ${month.toUpperCase()}`;
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
  }).format(parseLocalDate(date));
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(date));
}

export function formatWeekRange(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = addDays(start, 6);
  return `${formatLongDate(toISODate(start))} al ${formatLongDate(toISODate(end))}`;
}

export function isToday(date: string): boolean {
  return date.slice(0, ISO_DATE_LENGTH) === toISODate(new Date());
}
