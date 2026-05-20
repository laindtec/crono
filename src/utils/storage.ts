import type { DaySchedule, Person, StoredChecklist, WeekSchedule } from "../types";

const STORAGE_KEY = "homeScheduleChecklist:v1";

function readStore(): StoredChecklist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredChecklist) : {};
  } catch {
    return {};
  }
}

function writeStore(store: StoredChecklist): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function createChecklistKey(
  date: string,
  taskId: string,
  assignedTo: Person,
  itemIndex: number,
): string {
  return `${date}:${taskId}:${assignedTo}:${itemIndex}`;
}

export function getCompletedItemsForTask(
  date: string,
  taskId: string,
  assignedTo: Person,
  itemCount: number,
): boolean[] {
  const store = readStore();
  return Array.from(
    { length: itemCount },
    (_, index) => store[createChecklistKey(date, taskId, assignedTo, index)] === true,
  );
}

export function toggleChecklistItem(
  date: string,
  taskId: string,
  assignedTo: Person,
  itemIndex: number,
): void {
  const store = readStore();
  const key = createChecklistKey(date, taskId, assignedTo, itemIndex);
  store[key] = !store[key];
  writeStore(store);
}

export function setTaskCompletion(
  date: string,
  taskId: string,
  assignedTo: Person,
  itemCount: number,
  completed: boolean,
): void {
  const store = readStore();

  for (let index = 0; index < itemCount; index += 1) {
    store[createChecklistKey(date, taskId, assignedTo, index)] = completed;
  }

  writeStore(store);
}

export function resetDay(daySchedule: DaySchedule): void {
  const store = readStore();

  for (const task of daySchedule.tasks) {
    for (let index = 0; index < task.checklist.length; index += 1) {
      delete store[createChecklistKey(daySchedule.date, task.id, task.assignedTo, index)];
    }
  }

  writeStore(store);
}

export function cleanupPastDates(today: string): void {
  const store = readStore();
  let changed = false;

  for (const key of Object.keys(store)) {
    const date = key.slice(0, 10);

    if (date < today) {
      delete store[key];
      changed = true;
    }
  }

  if (changed) {
    writeStore(store);
  }
}

export function resetWeek(weekSchedule: WeekSchedule): void {
  const store = readStore();

  for (const day of weekSchedule.days) {
    for (const task of day.tasks) {
      for (let index = 0; index < task.checklist.length; index += 1) {
        delete store[createChecklistKey(day.date, task.id, task.assignedTo, index)];
      }
    }
  }

  writeStore(store);
}
