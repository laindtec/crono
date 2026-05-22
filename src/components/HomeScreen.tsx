import { useEffect, useMemo, useState } from "react";
import {
  fetchFranckWeather,
  formatWeatherDay,
  getWeatherIcon,
  getWeatherLabel,
  type WeatherData,
} from "../utils/weather";
import KitchenTimer from "./KitchenTimer";

type HomeScreenProps = {
  onOpenSchedule: () => void;
};

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
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

    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      className="min-h-screen cursor-pointer bg-black px-5 py-6 text-white sm:px-8"
      onClick={onOpenSchedule}
    >
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-6xl flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div onClick={(event) => event.stopPropagation()}>
            <KitchenTimer
              expanded={timerOpen}
              onClose={() => setTimerOpen(false)}
              onOpen={() => setTimerOpen(true)}
            />
          </div>

          <button
            type="button"
            className="flex min-h-24 w-40 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 text-left shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur transition active:scale-[0.98] sm:min-h-28 sm:w-56"
            onClick={(event) => {
              event.stopPropagation();
              setWeatherOpen(true);
            }}
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Clima</p>
              {weather ? (
                <p className="mt-2 text-4xl font-black leading-none text-white sm:text-5xl">
                  {weather.currentTemp}°
                </p>
              ) : (
                <p className="mt-2 text-sm font-bold text-white/65">No disponible</p>
              )}
            </div>
            {weather ? (
              <span className="text-5xl leading-none text-white" aria-hidden="true">
                {getWeatherIcon(weather.currentCode, weather.isDay)}
              </span>
            ) : null}
          </button>
        </div>

        <div className="pb-10">
          <p className="text-2xl font-bold capitalize text-white/55 sm:text-3xl">{dateLabel}</p>
          <h1 className="mt-3 text-[6.5rem] font-black leading-none tracking-normal text-white sm:text-[12.5rem] md:text-[16rem] lg:text-[18rem]">
            {formatClock(now)}
          </h1>
          <p className="mt-5 text-lg font-bold text-white/45 sm:text-xl">Tocá la pantalla para abrir el cronograma</p>
        </div>
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
                      <p className="text-sm font-black uppercase text-white/40">Sensación</p>
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
