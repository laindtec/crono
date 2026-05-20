export type Person = "Theo" | "Nahuel" | "Laura";

export type Task = {
  id: string;
  title: string;
  assignedTo: Person;
  checklist: string[];
  completedItems: boolean[];
};

export type DaySchedule = {
  date: string;
  tasks: Task[];
};

export type WeekSchedule = {
  weekStart: string;
  days: DaySchedule[];
};

export type StoredChecklist = Record<string, boolean>;
