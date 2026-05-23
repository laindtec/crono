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
      fill="currentColor"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M29.9 8.9c-1.1-2.4-3.8-3.5-6.2-2.7l-2.8 1c-3.1 1.1-6.6 1.1-9.8 0l-2.8-1c-2.4-.8-5 .4-6.2 2.7-1.5 3.2-1.5 6.9 0 10.1.9 1.9 2.7 3 4.6 3 .5 0 1.1-.1 1.6-.3l2.8-1c3.1-1.1 6.6-1.1 9.8 0l2.8 1c2.4.8 5.1-.3 6.2-2.7 1.5-3.2 1.5-6.8 0-10.1ZM20 11h2c.6 0 1 .4 1 1s-.4 1-1 1h-2c-.6 0-1-.4-1-1s.4-1 1-1ZM8 15H6c-.6 0-1-.4-1-1s.4-1 1-1h2c.6 0 1 .4 1 1s-.4 1-1 1Zm4 2h-2c-.6 0-1-.4-1-1s.4-1 1-1h2c.6 0 1 .4 1 1s-.4 1-1 1Zm0-4h-2c-.6 0-1-.4-1-1s.4-1 1-1h2c.6 0 1 .4 1 1s-.4 1-1 1Zm5 2h-2c-.6 0-1-.4-1-1s.4-1 1-1h2c.6 0 1 .4 1 1s-.4 1-1 1Zm5 2h-2c-.6 0-1-.4-1-1s.4-1 1-1h2c.6 0 1 .4 1 1s-.4 1-1 1Zm4-2h-2c-.6 0-1-.4-1-1s.4-1 1-1h2c.6 0 1 .4 1 1s-.4 1-1 1Z"
      />
      <path
        d="M25.3 24c-.8 0-1.5-.1-2.3-.4l-2.8-1c-2.7-1-5.7-1-8.4 0l-2.8 1c-.7.3-1.5.4-2.3.4-2.2 0-4.3-1.1-5.7-2.9.1 1.4.5 2.7 1.1 4 .9 1.9 2.7 3 4.6 3 .5 0 1.1-.1 1.6-.3l2.8-1c3.1-1.1 6.6-1.1 9.8 0l2.8 1c2.4.8 5.1-.3 6.2-2.7.6-1.2.9-2.6 1.1-3.9-1.4 1.8-3.5 2.8-5.7 2.8Z"
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
