import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_SECONDS = 5 * 60;
const PRESET_SECONDS = [3 * 60, 5 * 60, 10 * 60, 15 * 60];

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

export default function KitchenTimer() {
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
    <section
      className={`w-full rounded-lg border p-4 shadow-[0_18px_55px_rgba(0,0,0,0.35)] transition ${
        alarmActive
          ? "border-rose-300/70 bg-rose-500/20"
          : "border-white/10 bg-white/[0.045]"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-white/50">Timer</p>
        <p className="text-sm font-bold text-white/45">{running ? "Activo" : "Listo"}</p>
      </div>

      <p className="mt-3 text-6xl font-black leading-none tabular-nums text-white sm:text-7xl">
        {remainingLabel}
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {PRESET_SECONDS.map((seconds) => (
          <button
            className="min-h-11 rounded-lg bg-white/[0.08] px-2 text-sm font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
            key={seconds}
            onClick={() => setPreset(seconds)}
            type="button"
          >
            {Math.floor(seconds / 60)}m
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2">
        <button
          className="min-h-12 rounded-lg bg-cyan-300 px-3 text-base font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
          onClick={toggleTimer}
          type="button"
        >
          {running ? "Pausar" : remaining === 0 ? "Repetir" : "Iniciar"}
        </button>
        <button
          className="min-h-12 rounded-lg bg-white/[0.08] px-3 text-base font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
          onClick={addMinute}
          type="button"
        >
          +1m
        </button>
        <button
          className="min-h-12 rounded-lg bg-white/[0.08] px-3 text-base font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
          onClick={alarmActive ? stopAlarm : resetTimer}
          type="button"
        >
          {alarmActive ? "Parar" : "Reset"}
        </button>
      </div>
    </section>
  );
}
