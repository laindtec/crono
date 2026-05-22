import { useEffect, useState } from "react";

const CLEANING_DURATION_SECONDS = 30;

type CleaningModeProps = {
  active: boolean;
  onFinish: () => void;
};

export function BrushIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.5 4.5 19 9m-1.5-1.5-8.2 8.2c-.9.9-2.2 1.3-3.4.9l-1.6-.5.5-1.6c-.4-1.2 0-2.5.9-3.4l8.2-8.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M4.3 16.1 3 21l4.9-1.3M12 17l5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function CleaningMode({ active, onFinish }: CleaningModeProps) {
  const [remaining, setRemaining] = useState(CLEANING_DURATION_SECONDS);

  useEffect(() => {
    if (!active) {
      setRemaining(CLEANING_DURATION_SECONDS);
      return undefined;
    }

    setRemaining(CLEANING_DURATION_SECONDS);
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          onFinish();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active, onFinish]);

  if (!active) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex cursor-not-allowed items-center justify-center bg-black/95 px-6 text-white">
      <div className="pointer-events-none flex w-full max-w-sm flex-col items-center text-center">
        <BrushIcon className="h-20 w-20 text-cyan-200" />
        <p className="mt-7 text-5xl font-black tabular-nums">{remaining}s</p>
        <p className="mt-4 text-xl font-black uppercase tracking-[0.18em] text-white/60">
          Modo limpieza
        </p>
      </div>
    </div>
  );
}
