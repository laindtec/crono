const ISO_DATE_LENGTH = 10;
export const APP_TIME_ZONE = "America/Argentina/Cordoba";

export const BASE_WEEK_START = "2026-05-18";

export function parseLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00-03:00`);
}

function getAppDatePart(date: Date, type: "year" | "month" | "day"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return parts.find((part) => part.type === type)?.value ?? "";
}

export function toISODate(date: Date): string {
  const year = getAppDatePart(date, "year");
  const month = getAppDatePart(date, "month");
  const day = getAppDatePart(date, "day");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function differenceInDays(date: Date, baseDate: Date): number {
  const utcDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const utcBase = Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate());
  return Math.round((utcDate - utcBase) / 86_400_000);
}

export function getMonday(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

export function getTodayISODate(): string {
  return toISODate(new Date());
}

export function getDateFromTodayOffset(dayOffset: number): string {
  return toISODate(addDays(parseLocalDate(getTodayISODate()), Math.max(0, dayOffset)));
}

export function getCurrentWeekOffset(): number {
  const currentMonday = getMonday(parseLocalDate(getTodayISODate()));
  const baseMonday = parseLocalDate(BASE_WEEK_START);
  return Math.round(differenceInDays(currentMonday, baseMonday) / 7);
}

export function formatDayName(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
  }).format(parseLocalDate(date));
}

export function formatDayHeading(date: string): string {
  const parsedDate = parseLocalDate(date);
  const weekday = new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
  }).format(parsedDate);
  const month = new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    month: "long",
  }).format(parsedDate);
  const capitalizedWeekday = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;

  return `${capitalizedWeekday} ${getAppDatePart(parsedDate, "day")} ${month.toUpperCase()}`;
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(parseLocalDate(date));
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
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
  return date.slice(0, ISO_DATE_LENGTH) === getTodayISODate();
}
