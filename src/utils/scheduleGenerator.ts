import type { DaySchedule, Person, StoredChecklist, Task, WeekSchedule } from "../types";
import {
  addDays,
  BASE_WEEK_START,
  differenceInDays,
  getMonday,
  parseLocalDate,
  toISODate,
} from "./dateUtils";
import { getCompletedItemsForTask } from "./storage";

const dishwashingChecklist = [
  "Lavar los platos después del almuerzo.",
  "Lavar los platos después de la cena.",
  "Limpiar la mesada.",
  "Limpiar la cocina.",
  "Limpiar fuentes y utensilios usados.",
  "Limpiar el piso de la cocina.",
  "Revisar la basura y sacarla si es necesario.",
];

const cookingChecklist = ["Preparar la cena."];

const bathroomChecklist = [
  "Cepillar el piso del baño.",
  "Lavar el vidrio de la ducha.",
  "Limpiar los azulejos.",
  "Limpiar la cerámica del inodoro con Cif.",
  "Limpiar el lavamanos con Cif.",
  "Revisar el espejo.",
  "Limpiar el espejo con un poco de limpiavidrios usando papel higiénico.",
  "Secar el espejo con papel seco.",
];

export function getDishwasherForDate(date: string): Person {
  const dayOffset = differenceInDays(parseLocalDate(date), parseLocalDate(BASE_WEEK_START));
  return Math.abs(dayOffset % 2) === 0 ? "Theo" : "Nahuel";
}

export function getCookForDate(date: string): Person {
  return getDishwasherForDate(date) === "Theo" ? "Nahuel" : "Theo";
}

export function getBathroomCleanerForWeek(weekStart: string): Person {
  const weekOffset = Math.round(
    differenceInDays(parseLocalDate(weekStart), parseLocalDate(BASE_WEEK_START)) / 7,
  );
  return Math.abs(weekOffset % 2) === 0 ? "Theo" : "Nahuel";
}

function getOtherPerson(person: Person): Person {
  return person === "Theo" ? "Nahuel" : "Theo";
}

function createTask(
  checks: StoredChecklist,
  date: string,
  id: string,
  title: string,
  assignedTo: Person,
  checklist: string[],
): Task {
  return {
    id,
    title,
    assignedTo,
    checklist,
    completedItems: getCompletedItemsForTask(checks, date, id, assignedTo, checklist.length),
  };
}

export function generateDayScheduleForDate(date: string, checks: StoredChecklist = {}): DaySchedule {
  const weekStart = toISODate(getMonday(parseLocalDate(date)));
  const isFriday = parseLocalDate(date).getDay() === 5;
  const dishwasher = getDishwasherForDate(date);
  const tasks: Task[] = [
    createTask(
      checks,
      date,
      "dishwashing-kitchen",
      "Lavar platos y limpiar cocina",
      dishwasher,
      dishwashingChecklist,
    ),
  ];

  if (!isFriday) {
    tasks.push(
      createTask(checks, date, "night-cooking", "Cocinar de noche", getCookForDate(date), cookingChecklist),
    );
  }

  if (isFriday) {
    const weeklyBathroomCleaner = getBathroomCleanerForWeek(weekStart);
    const bathroomCleaner =
      weeklyBathroomCleaner === dishwasher ? getOtherPerson(dishwasher) : weeklyBathroomCleaner;

    tasks.push(
      createTask(
        checks,
        date,
        "bathroom-deep-clean",
        "Limpieza profunda del baño",
        bathroomCleaner,
        bathroomChecklist,
      ),
    );
  }

  return { date, tasks };
}

export function generateWeekSchedule(weekOffset: number): WeekSchedule {
  const baseWeekStart = parseLocalDate(BASE_WEEK_START);
  const weekStartDate = addDays(baseWeekStart, weekOffset * 7);
  const weekStart = toISODate(weekStartDate);

  return {
    weekStart,
    days: Array.from({ length: 7 }, (_, index) =>
      generateDayScheduleForDate(toISODate(addDays(weekStartDate, index))),
    ),
  };
}
