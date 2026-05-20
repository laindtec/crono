type ProgressBarProps = {
  completed: number;
  total: number;
  label: string;
  compact?: boolean;
};

export default function ProgressBar({ completed, total, label, compact = false }: ProgressBarProps) {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="w-full" aria-label={`${label}: ${percentage}%`}>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm font-semibold text-slate-300">
        <span>{label}</span>
        <span className="tabular-nums text-cyan-200">
          {completed}/{total}
        </span>
      </div>
      <div className={`${compact ? "h-2" : "h-3"} overflow-hidden rounded-full bg-slate-800`}>
        <div
          className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.55)] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
