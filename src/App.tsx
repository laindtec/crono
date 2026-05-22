import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import CamPage from "./components/CamPage";
import CleaningMode, { BrushIcon } from "./components/CleaningMode";
import DayCard from "./components/DayCard";
import HomeScreen from "./components/HomeScreen";
import type { Task } from "./types";
import { formatLongDate, getDateFromTodayOffset, getTodayISODate } from "./utils/dateUtils";
import { generateDayScheduleForDate } from "./utils/scheduleGenerator";
import {
  cleanupPastDates,
  fetchChecks,
  fetchStorageStatus,
  getLocalChecks,
  resetDay,
  setChecklistItem,
  setTaskCompletion,
} from "./utils/storage";

const SWIPE_THRESHOLD = 70;
const DRAG_LIMIT = 140;
const CLOCK_IDLE_TIMEOUT_MS = 120_000;

type SlideDirection = "next" | "previous" | "today";

function requestAppFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) {
    return;
  }

  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {
    // Browsers usually require a user gesture before entering fullscreen.
  });
}

function getDayContextLabel(dayOffset: number): string {
  if (dayOffset === 0) {
    return "Hoy";
  }

  if (dayOffset === 1) {
    return "Mañana";
  }

  return `En ${dayOffset} días`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, input, label, a, summary"));
}

export default function App() {
  if (window.location.pathname.startsWith("/cam")) {
    return <CamPage />;
  }

  const today = useMemo(() => getTodayISODate(), []);
  const [showSchedule, setShowSchedule] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [checks, setChecks] = useState(() => getLocalChecks());
  const [storageStatus, setStorageStatus] = useState<"checking" | "mysql" | "memory" | "unavailable">(
    "checking",
  );
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("today");
  const [cleaningModeActive, setCleaningModeActive] = useState(false);
  const swipeStartX = useRef<number | null>(null);

  const selectedDate = useMemo(() => getDateFromTodayOffset(dayOffset), [dayOffset]);
  const daySchedule = useMemo(
    () => generateDayScheduleForDate(selectedDate, checks),
    [selectedDate, checks, refreshToken],
  );

  useEffect(() => {
    cleanupPastDates(today);
  }, [today]);

  useEffect(() => {
    requestAppFullscreen();

    function handleFirstInteraction() {
      requestAppFullscreen();
    }

    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchStorageStatus().then((status) => {
      if (active) {
        setStorageStatus(status);
      }
    });

    fetchChecks(today).then((nextChecks) => {
      if (active) {
        setChecks(nextChecks);
      }
    });

    return () => {
      active = false;
    };
  }, [today, refreshToken]);

  useEffect(() => {
    if (!showSchedule) {
      return undefined;
    }

    let idleTimer = window.setTimeout(() => {
      setDayOffset(0);
      setSlideDirection("today");
      setDragOffset(0);
      setShowSchedule(false);
    }, CLOCK_IDLE_TIMEOUT_MS);

    function resetIdleTimer() {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        setDayOffset(0);
        setSlideDirection("today");
        setDragOffset(0);
        setShowSchedule(false);
      }, CLOCK_IDLE_TIMEOUT_MS);
    }

    window.addEventListener("pointerdown", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);

    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointerdown", resetIdleTimer);
      window.removeEventListener("keydown", resetIdleTimer);
    };
  }, [showSchedule]);

  function refreshSchedule() {
    setRefreshToken((current) => current + 1);
  }

  function goToDay(nextOffset: number, direction: SlideDirection) {
    setSlideDirection(direction);
    setDayOffset(Math.max(0, nextOffset));
  }

  async function handleToggleItem(date: string, task: Task, itemIndex: number) {
    const completed = !task.completedItems[itemIndex];
    const key = `${date}:${task.id}:${task.assignedTo}:${itemIndex}`;
    setChecks((current) => ({ ...current, [key]: completed }));

    try {
      await setChecklistItem(date, task.id, task.assignedTo, itemIndex, completed);
    } finally {
      refreshSchedule();
    }
  }

  async function handleMarkAll(date: string, task: Task, completed: boolean) {
    setChecks((current) => {
      const next = { ...current };

      for (let index = 0; index < task.checklist.length; index += 1) {
        next[`${date}:${task.id}:${task.assignedTo}:${index}`] = completed;
      }

      return next;
    });

    try {
      await setTaskCompletion(date, task.id, task.assignedTo, task.checklist.length, completed);
    } finally {
      refreshSchedule();
    }
  }

  async function handleResetDay() {
    setChecks((current) => {
      const next = { ...current };

      for (const task of daySchedule.tasks) {
        for (let index = 0; index < task.checklist.length; index += 1) {
          delete next[`${daySchedule.date}:${task.id}:${task.assignedTo}:${index}`];
        }
      }

      return next;
    });

    try {
      await resetDay(daySchedule);
    } finally {
      refreshSchedule();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (isInteractiveTarget(event.target)) {
      swipeStartX.current = null;
      return;
    }

    swipeStartX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (swipeStartX.current === null) {
      return;
    }

    const distance = event.clientX - swipeStartX.current;
    const lockedDistance = dayOffset === 0 && distance > 0 ? distance * 0.22 : distance;
    setDragOffset(Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, lockedDistance)));
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (swipeStartX.current === null) {
      return;
    }

    const distance = event.clientX - swipeStartX.current;
    swipeStartX.current = null;
    setDragOffset(0);

    if (Math.abs(distance) < SWIPE_THRESHOLD) {
      return;
    }

    if (distance < 0) {
      goToDay(dayOffset + 1, "next");
      return;
    }

    if (dayOffset > 0) {
      goToDay(dayOffset - 1, "previous");
    }
  }

  function handlePointerCancel() {
    swipeStartX.current = null;
    setDragOffset(0);
  }

  const finishCleaningMode = useCallback(() => {
    setCleaningModeActive(false);
  }, []);

  const cleaningModeControls = (
    <>
      <CleaningMode active={cleaningModeActive} onFinish={finishCleaningMode} />
      {!cleaningModeActive ? (
        <button
          aria-label="Activar modo limpieza"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-cyan-100 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-slate-900 active:scale-[0.95]"
          onClick={(event) => {
            event.stopPropagation();
            setCleaningModeActive(true);
          }}
          title="Modo limpieza"
          type="button"
        >
          <BrushIcon className="h-7 w-7" />
        </button>
      ) : null}
    </>
  );

  if (!showSchedule) {
    return (
      <>
        <HomeScreen onOpenSchedule={() => setShowSchedule(true)} />
        {cleaningModeControls}
      </>
    );
  }

  return (
    <>
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <section className="animate-fade-in mb-4 rounded-xl border border-white/10 bg-slate-900/80 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black leading-tight text-white sm:text-4xl">
              Cronograma de Tareas del Hogar
            </h1>
            <p className="mt-2 text-lg font-semibold text-slate-300">
              {getDayContextLabel(dayOffset)} · {formatLongDate(selectedDate)}
            </p>
          </div>
          <button
            type="button"
            className="min-h-12 rounded-lg bg-slate-700 px-4 py-3 text-base font-bold text-white shadow-sm ring-1 ring-white/10 transition duration-200 hover:bg-slate-600 active:scale-[0.97] sm:min-w-40"
            onClick={handleResetDay}
          >
            Resetear día
          </button>
        </div>
      </section>

      {storageStatus !== "checking" && storageStatus !== "mysql" ? (
        <section className="animate-rise-in mb-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
          <p className="text-base font-black">Sin sincronización entre dispositivos</p>
          <p className="mt-1 text-sm font-semibold text-amber-100/80">
            La app está usando almacenamiento local porque MySQL no está activo en el servidor.
          </p>
        </section>
      ) : null}

      <section
        className="flex-1 select-none touch-pan-y overflow-hidden"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className={`h-full ${
            slideDirection === "next"
              ? "animate-slide-in-next"
              : slideDirection === "previous"
                ? "animate-slide-in-previous"
                : "animate-scale-in"
          }`}
          key={daySchedule.date}
          style={{
            transform: dragOffset ? `translate3d(${dragOffset}px, 0, 0)` : undefined,
            transition: dragOffset ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <DayCard
            day={daySchedule}
            onToggleItem={handleToggleItem}
            onMarkAll={handleMarkAll}
          />
        </div>
      </section>

      <section className="mt-4 min-h-14">
        {dayOffset > 0 ? (
          <button
            type="button"
            className="animate-rise-in min-h-14 w-full rounded-lg bg-cyan-400 px-5 py-4 text-lg font-black text-slate-950 shadow-[0_14px_35px_rgba(34,211,238,0.22)] transition duration-200 hover:bg-cyan-300 active:scale-[0.97]"
            onClick={() => goToDay(0, "today")}
          >
            Volver a hoy
          </button>
        ) : null}
      </section>
    </main>
    {cleaningModeControls}
    </>
  );
}
