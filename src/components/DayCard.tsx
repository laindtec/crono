import type { DaySchedule, Task } from "../types";
import { formatDayName, formatShortDate, isToday } from "../utils/dateUtils";
import ProgressBar from "./ProgressBar";
import TaskCard from "./TaskCard";

type DayCardProps = {
  day: DaySchedule;
  onToggleItem: (date: string, task: Task, itemIndex: number) => void;
  onMarkAll: (date: string, task: Task, completed: boolean) => void;
};

export default function DayCard({ day, onToggleItem, onMarkAll }: DayCardProps) {
  const totalItems = day.tasks.reduce((sum, task) => sum + task.checklist.length, 0);
  const completedItems = day.tasks.reduce(
    (sum, task) => sum + task.completedItems.filter(Boolean).length,
    0,
  );
  const highlighted = isToday(day.date);

  return (
    <section
      className={`flex min-h-[calc(100svh-260px)] flex-col rounded-xl border bg-slate-950/92 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.45)] transition-all duration-300 sm:min-h-[calc(100svh-280px)] sm:p-6 ${
        highlighted ? "border-cyan-300/50 ring-4 ring-cyan-300/10" : "border-white/10"
      }`}
    >
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="animate-rise-in">
          <div className="flex items-center gap-2">
            <h2 className="capitalize text-3xl font-black text-white sm:text-4xl">
              {formatDayName(day.date)}
            </h2>
            {highlighted ? (
              <span className="animate-scale-in rounded-full bg-cyan-300 px-3 py-1 text-xs font-bold text-slate-950">
                Hoy
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xl font-semibold text-slate-400">{formatShortDate(day.date)}</p>
        </div>
        <div className="animate-rise-in w-full rounded-lg border border-white/10 bg-slate-900 p-4 sm:w-72">
          <ProgressBar completed={completedItems} total={totalItems} label="Progreso del día" />
        </div>
      </header>

      <div className="flex-1 space-y-4">
        {day.tasks.map((task, index) => (
          <div
            className="animate-rise-in"
            key={`${day.date}-${task.id}-${task.assignedTo}`}
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <TaskCard
              date={day.date}
              task={task}
              onToggleItem={onToggleItem}
              onMarkAll={onMarkAll}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
