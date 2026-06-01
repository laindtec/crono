import { useEffect, useMemo, useState } from "react";
import {
  fetchFranckWeather,
  formatWeatherDay,
  getWeatherIcon,
  getWeatherLabel,
  type WeatherData,
} from "../utils/weather";
import { APP_TIME_ZONE } from "../utils/dateUtils";
import KitchenTimer from "./KitchenTimer";

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

type HomeScreenProps = {
  onOpenSchedule: () => void;
};

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function ChevronRightIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function CalendarIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function HomeScreen({ onOpenSchedule }: HomeScreenProps) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const dateLabel = useMemo(() => formatDate(now), [now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    function refreshWeather() {
      fetchFranckWeather()
        .then((data) => {
          if (active) {
            setWeather(data);
          }
        })
        .catch(() => {
          if (active) {
            setWeather(null);
          }
        });
    }

    refreshWeather();
    const timer = window.setInterval(refreshWeather, WEATHER_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main
      className="min-h-dvh cursor-pointer overflow-hidden bg-[#05070a] px-4 py-4 text-white sm:px-7 sm:py-6"
      onClick={onOpenSchedule}
    >
      <section className="mx-auto grid min-h-[calc(100dvh-32px)] w-full max-w-7xl grid-rows-[auto_1fr_auto] gap-4 sm:min-h-[calc(100dvh-48px)] sm:gap-6">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200/75">Crono cocina</p>
            <p className="mt-2 text-sm font-bold capitalize text-white/55 sm:text-base">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm font-black text-emerald-100 shadow-[0_0_35px_rgba(52,211,153,0.12)]">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
            En servicio
          </div>
        </header>

        <div className="grid items-stretch gap-5 xl:grid-cols-[9rem_1fr_16rem]">
          <div
            className="flex items-start justify-between gap-3 xl:flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <KitchenTimer
              expanded={timerOpen}
              onClose={() => setTimerOpen(false)}
              onOpen={() => setTimerOpen(true)}
            />
            <div className="hidden w-full rounded-lg border border-white/10 bg-white/[0.035] p-4 xl:block">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Panel</p>
              <p className="mt-2 text-sm font-bold leading-snug text-white/60">Tablet principal</p>
            </div>
          </div>

          <section className="flex min-h-[20rem] flex-col justify-center border-y border-white/10 py-7 sm:min-h-[27rem] sm:py-10 xl:min-h-[34rem] xl:border-x xl:px-8">
            <p className="text-sm font-black uppercase tracking-[0.26em] text-white/35">Hora local</p>
            <h1 className="mt-4 text-[6.1rem] font-black leading-none tracking-normal text-white sm:text-[11rem] md:text-[14rem] xl:text-[15.5rem]">
              {formatClock(now)}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/65">
                America/Buenos_Aires
              </span>
              <span className="rounded-full border border-cyan-200/15 bg-cyan-200/10 px-4 py-2 text-sm font-black text-cyan-100">
                Cronograma listo
              </span>
            </div>
          </section>

          <button
            type="button"
            className="flex min-h-36 w-full items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.045] p-5 text-left shadow-[0_18px_55px_rgba(0,0,0,0.25)] transition active:scale-[0.98] xl:min-h-full xl:flex-col xl:items-stretch"
            onClick={(event) => {
              event.stopPropagation();
              setWeatherOpen(true);
            }}
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/35">Clima</p>
              {weather ? (
                <>
                  <p className="mt-4 text-6xl font-black leading-none text-white xl:text-7xl">
                    {weather.currentTemp}°
                  </p>
                  <p className="mt-3 text-lg font-black text-white/65">
                    {getWeatherLabel(weather.currentCode)}
                  </p>
                </>
              ) : (
                <p className="mt-4 text-lg font-bold text-white/65">No disponible</p>
              )}
            </div>
            {weather ? (
              <div className="flex items-end justify-between gap-4 xl:w-full">
                <span className="text-6xl leading-none text-white xl:text-7xl" aria-hidden="true">
                  {getWeatherIcon(weather.currentCode, weather.isDay)}
                </span>
                <div className="text-right text-sm font-black text-white/45">
                  <p>Sens. {weather.apparentTemp}°</p>
                  <p>Hum. {weather.humidity}%</p>
                </div>
              </div>
            ) : null}
          </button>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-cyan-200 text-slate-950">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-white">Abrir cronograma</p>
              <p className="truncate text-sm font-bold capitalize text-white/45">{dateLabel}</p>
            </div>
          </div>
          <ChevronRightIcon className="h-9 w-9 shrink-0 text-cyan-100" />
        </footer>
      </section>

      {weatherOpen ? (
        <div
          className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black/95 px-4 py-6 text-white"
          onClick={(event) => {
            event.stopPropagation();
            setWeatherOpen(false);
          }}
        >
          <section
            className="w-full max-w-5xl rounded-lg border border-white/10 bg-slate-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-white/45">
                  Franck, Santa Fe
                </p>
                <h2 className="mt-3 text-4xl font-black text-white sm:text-6xl">Clima</h2>
              </div>
              <button
                aria-label="Cerrar clima"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.08] text-3xl font-black text-white transition hover:bg-white/[0.14] active:scale-[0.96]"
                onClick={() => setWeatherOpen(false)}
                type="button"
              >
                x
              </button>
            </div>

            {weather ? (
              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-lg bg-white/[0.06] p-6">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <p className="text-8xl font-black leading-none text-white sm:text-9xl">
                        {weather.currentTemp}°
                      </p>
                      <p className="mt-4 text-2xl font-black text-white/70">
                        {getWeatherLabel(weather.currentCode)}
                      </p>
                    </div>
                    <span className="text-8xl leading-none" aria-hidden="true">
                      {getWeatherIcon(weather.currentCode, weather.isDay)}
                    </span>
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-black/25 p-4">
                      <p className="text-sm font-black uppercase text-white/40">Sensacion</p>
                      <p className="mt-2 text-2xl font-black">{weather.apparentTemp}°</p>
                    </div>
                    <div className="rounded-lg bg-black/25 p-4">
                      <p className="text-sm font-black uppercase text-white/40">Humedad</p>
                      <p className="mt-2 text-2xl font-black">{weather.humidity}%</p>
                    </div>
                    <div className="rounded-lg bg-black/25 p-4">
                      <p className="text-sm font-black uppercase text-white/40">Viento</p>
                      <p className="mt-2 text-2xl font-black">{weather.windSpeed}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {weather.daily.slice(1).map((day) => (
                    <div
                      className="grid min-h-20 grid-cols-[4rem_4rem_1fr_auto] items-center gap-4 rounded-lg bg-white/[0.06] px-4"
                      key={day.date}
                    >
                      <span className="text-xl font-black text-white/70">{formatWeatherDay(day.date)}</span>
                      <span className="text-4xl leading-none" aria-hidden="true">
                        {getWeatherIcon(day.code)}
                      </span>
                      <span className="text-xl font-bold text-white/60">{getWeatherLabel(day.code)}</span>
                      <span className="text-right text-2xl font-black tabular-nums text-white">
                        {day.max}° / {day.min}° · {day.rainChance}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-8 text-2xl font-bold text-white/60">Clima no disponible</p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
