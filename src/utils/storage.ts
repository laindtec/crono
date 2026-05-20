import type { DaySchedule, Person, StoredChecklist, WeekSchedule } from "../types";

const STORAGE_KEY = "homeScheduleChecklist:v1";

function readLocalStore(): StoredChecklist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredChecklist) : {};
  } catch {
    return {};
  }
}

function writeLocalStore(store: StoredChecklist): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

async function apiRequest(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response;
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
  checks: StoredChecklist,
  date: string,
  taskId: string,
  assignedTo: Person,
  itemCount: number,
): boolean[] {
  return Array.from(
    { length: itemCount },
    (_, index) => checks[createChecklistKey(date, taskId, assignedTo, index)] === true,
  );
}

export function getLocalChecks(): StoredChecklist {
  return readLocalStore();
}

export async function fetchChecks(from: string): Promise<StoredChecklist> {
  try {
    const response = await apiRequest(`/api/checks?from=${encodeURIComponent(from)}`);
    const data = (await response.json()) as { checks?: StoredChecklist };
    const checks = data.checks ?? {};
    writeLocalStore(checks);
    return checks;
  } catch {
    return readLocalStore();
  }
}

export async function setChecklistItem(
  date: string,
  taskId: string,
  assignedTo: Person,
  itemIndex: number,
  completed: boolean,
): Promise<void> {
  const store = readLocalStore();
  store[createChecklistKey(date, taskId, assignedTo, itemIndex)] = completed;
  writeLocalStore(store);

  try {
    await apiRequest("/api/checks/item", {
      method: "POST",
      body: JSON.stringify({ date, taskId, assignedTo, itemIndex, completed }),
    });
  } catch {
    // Keep the optimistic local state if the shared API is temporarily unavailable.
  }
}

export async function setTaskCompletion(
  date: string,
  taskId: string,
  assignedTo: Person,
  itemCount: number,
  completed: boolean,
): Promise<void> {
  const store = readLocalStore();

  for (let index = 0; index < itemCount; index += 1) {
    store[createChecklistKey(date, taskId, assignedTo, index)] = completed;
  }

  writeLocalStore(store);

  try {
    await apiRequest("/api/checks/task", {
      method: "POST",
      body: JSON.stringify({ date, taskId, assignedTo, itemCount, completed }),
    });
  } catch {
    // Keep the optimistic local state if the shared API is temporarily unavailable.
  }
}

export async function resetDay(daySchedule: DaySchedule): Promise<void> {
  const store = readLocalStore();

  for (const task of daySchedule.tasks) {
    for (let index = 0; index < task.checklist.length; index += 1) {
      delete store[createChecklistKey(daySchedule.date, task.id, task.assignedTo, index)];
    }
  }

  writeLocalStore(store);

  try {
    await apiRequest("/api/checks/reset-day", {
      method: "POST",
      body: JSON.stringify({ date: daySchedule.date }),
    });
  } catch {
    // Keep the optimistic local state if the shared API is temporarily unavailable.
  }
}

export function cleanupPastDates(today: string): void {
  const store = readLocalStore();
  let changed = false;

  for (const key of Object.keys(store)) {
    const date = key.slice(0, 10);

    if (date < today) {
      delete store[key];
      changed = true;
    }
  }

  if (changed) {
    writeLocalStore(store);
  }
}

export function resetWeek(weekSchedule: WeekSchedule): void {
  const store = readLocalStore();

  for (const day of weekSchedule.days) {
    for (const task of day.tasks) {
      for (let index = 0; index < task.checklist.length; index += 1) {
        delete store[createChecklistKey(day.date, task.id, task.assignedTo, index)];
      }
    }
  }

  writeLocalStore(store);
}
