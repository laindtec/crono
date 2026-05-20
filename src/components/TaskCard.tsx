import { useId, useState } from "react";
import type { Task } from "../types";

type TaskCardProps = {
  date: string;
  task: Task;
  onToggleItem: (date: string, task: Task, itemIndex: number) => void;
  onMarkAll: (date: string, task: Task, completed: boolean) => void;
};

export default function TaskCard({ date, task, onToggleItem, onMarkAll }: TaskCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();
  const completedCount = task.completedItems.filter(Boolean).length;
  const isComplete = completedCount === task.checklist.length;

  return (
    <article
      className={`rounded-lg border p-4 transition-all duration-300 ease-out ${
        isComplete
          ? "border-emerald-300/35 bg-emerald-400/10 shadow-[0_16px_40px_rgba(16,185,129,0.12)]"
          : "border-white/10 bg-slate-900"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          className="min-h-16 flex-1 text-left transition-transform duration-200 active:scale-[0.995]"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((current) => !current)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-white sm:text-xl">{task.title}</h3>
              <p className="mt-2 text-base font-black uppercase tracking-wide text-slate-400">
                Responsable
              </p>
              <p className="mt-1 text-3xl font-black leading-none text-cyan-200 sm:text-4xl">
                {task.assignedTo}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all duration-300 ${
                isComplete ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-300"
              }`}
            >
              {isComplete ? "Completa" : "Pendiente"}
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-400">
            {completedCount}/{task.checklist.length} ítems completados · {isOpen ? "Ocultar" : "Ver"} checklist
          </p>
        </button>

        <button
          type="button"
          className={`min-h-12 rounded-lg px-4 py-3 text-sm font-bold shadow-sm transition-all duration-200 active:scale-[0.97] ${
            isComplete
              ? "bg-slate-800 text-slate-200 ring-1 ring-white/10 hover:bg-slate-700"
              : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
          }`}
          onClick={() => onMarkAll(date, task, !isComplete)}
        >
          {isComplete ? "Desmarcar todo" : "Marcar todo"}
        </button>
      </div>

      <div
        id={contentId}
        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
          isOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3">
            {task.checklist.map((item, index) => {
              const inputId = `${date}-${task.id}-${task.assignedTo}-${index}`;
              const checked = task.completedItems[index];

              return (
                <label
                  className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all duration-250 active:scale-[0.99] ${
                    checked
                      ? "border-emerald-300/30 bg-emerald-300/10 text-slate-200 shadow-[inset_4px_0_0_rgba(52,211,153,0.65)]"
                      : "border-white/10 bg-slate-950/70 text-slate-200"
                  }`}
                  htmlFor={inputId}
                  key={inputId}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleItem(date, task, index)}
                    className="mt-1 h-7 w-7 shrink-0 rounded border-slate-500 accent-emerald-400 transition-transform duration-200 checked:scale-110"
                  />
                  <span
                    className={`text-lg leading-7 transition-all duration-200 ${
                      checked ? "text-slate-400 line-through decoration-emerald-300" : ""
                    }`}
                  >
                    {item}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}
