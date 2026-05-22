import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_SECONDS = 5 * 60;
const PRESET_SECONDS = [3 * 60, 5 * 60, 10 * 60, 15 * 60];

type KitchenTimerProps = {
  expanded: boolean;
  onClose: () => void;
  onOpen: () => void;
};

export function TimerIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 2h4M12 8v5l3 2M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createBeep(context: AudioContext) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.36);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.4);
}

export default function KitchenTimer({ expanded, onClose, onOpen }: KitchenTimerProps) {
  const [duration, setDuration] = useState(DEFAULT_SECONDS);
  const [remaining, setRemaining] = useState(DEFAULT_SECONDS);
  const [running, setRunning] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const remainingLabel = useMemo(() => formatTimer(remaining), [remaining]);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          setAlarmActive(true);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!alarmActive) {
      return undefined;
    }

    const context = audioContextRef.current;
    if (!context) {
      return undefined;
    }

    createBeep(context);
    const alarm = window.setInterval(() => createBeep(context), 1000);
    return () => window.clearInterval(alarm);
  }, [alarmActive]);

  function ensureAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    audioContextRef.current.resume().catch(() => {});
  }

  function setPreset(seconds: number) {
    setDuration(seconds);
    setRemaining(seconds);
    setRunning(false);
    setAlarmActive(false);
  }

  function addMinute() {
    const nextDuration = duration + 60;
    setDuration(nextDuration);
    setRemaining((current) => (running ? current + 60 : nextDuration));
  }

  function toggleTimer() {
    ensureAudioContext();
    setAlarmActive(false);

    if (remaining === 0) {
      setRemaining(duration);
      setRunning(true);
      return;
    }

    setRunning((current) => !current);
  }

  function resetTimer() {
    setRunning(false);
    setAlarmActive(false);
    setRemaining(duration);
  }

  function stopAlarm() {
    setAlarmActive(false);
    setRemaining(duration);
  }

  return (
    <>
      <button
        aria-label="Abrir timer"
        className={`flex h-24 w-24 flex-col items-center justify-center rounded-full border text-white shadow-[0_18px_55px_rgba(0,0,0,0.35)] transition active:scale-[0.96] sm:h-28 sm:w-28 ${
          alarmActive
            ? "border-rose-300 bg-rose-500/30"
            : running
              ? "border-cyan-200/80 bg-cyan-300/15"
              : "border-white/10 bg-white/[0.045]"
        }`}
        onClick={onOpen}
        type="button"
      >
        <TimerIcon className="h-9 w-9 text-cyan-100" />
        <span className="mt-2 text-sm font-black tabular-nums text-white/75">{remainingLabel}</span>
      </button>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/95 px-4 py-6 text-white"
          onClick={onClose}
        >
          <section
            className={`w-full max-w-4xl rounded-lg border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8 ${
              alarmActive
                ? "border-rose-300/70 bg-rose-500/20"
                : "border-white/10 bg-slate-950"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-white/45">Timer</p>
                <p className="mt-2 text-xl font-bold text-white/60">
                  {alarmActive ? "Alarma sonando" : running ? "Activo" : "Listo para usar"}
                </p>
              </div>
              <button
                aria-label="Cerrar timer"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.08] text-3xl font-black text-white transition hover:bg-white/[0.14] active:scale-[0.96]"
                onClick={onClose}
                type="button"
              >
                x
              </button>
            </div>

            <p className="mt-8 text-center text-[7rem] font-black leading-none tabular-nums text-white sm:text-[11rem]">
              {remainingLabel}
            </p>

            <div className="mt-8 grid grid-cols-4 gap-3">
              {PRESET_SECONDS.map((seconds) => (
                <button
                  className="min-h-20 rounded-lg bg-white/[0.08] px-3 text-2xl font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
                  key={seconds}
                  onClick={() => setPreset(seconds)}
                  type="button"
                >
                  {Math.floor(seconds / 60)}m
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_1fr_1fr] gap-3">
        <button
          className="min-h-20 rounded-lg bg-cyan-300 px-4 text-2xl font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
          onClick={toggleTimer}
          type="button"
        >
          {running ? "Pausar" : remaining === 0 ? "Repetir" : "Iniciar"}
        </button>
        <button
          className="min-h-20 rounded-lg bg-white/[0.08] px-4 text-2xl font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
          onClick={addMinute}
          type="button"
        >
          +1m
        </button>
        <button
          className="min-h-20 rounded-lg bg-white/[0.08] px-4 text-2xl font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
          onClick={alarmActive ? stopAlarm : resetTimer}
          type="button"
        >
          {alarmActive ? "Parar" : "Reset"}
        </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
