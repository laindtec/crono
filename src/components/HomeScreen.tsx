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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div
            className="w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <KitchenTimer />
          </div>

          <button
            type="button"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-left shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur transition active:scale-[0.98] sm:w-[25rem]"
            onClick={(event) => {
              event.stopPropagation();
              setWeatherOpen((current) => !current);
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-white/50">Franck, Santa Fe</p>
                {weather ? (
                  <p className="mt-2 text-lg font-bold text-white/70">{getWeatherLabel(weather.currentCode)}</p>
                ) : null}
              </div>
              {weather ? (
                <span className="text-5xl leading-none text-white" aria-hidden="true">
                  {getWeatherIcon(weather.currentCode, weather.isDay)}
                </span>
              ) : null}
            </div>

            {weather ? (
              <>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-6xl font-black leading-none">{weather.currentTemp}°</p>
                    <p className="mt-2 text-sm font-bold text-white/55">Sensación {weather.apparentTemp}°</p>
                  </div>
                  <div className="grid gap-2 text-right text-sm font-bold text-white/65">
                    <span>Humedad {weather.humidity}%</span>
                    <span>Viento {weather.windSpeed} km/h</span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {weather.daily.slice(1, 4).map((day) => (
                    <div className="rounded-xl bg-white/[0.06] p-3 text-center" key={day.date}>
                      <p className="text-xs font-black uppercase text-white/45">{formatWeatherDay(day.date)}</p>
                      <p className="mt-1 text-3xl leading-none" aria-hidden="true">
                        {getWeatherIcon(day.code)}
                      </p>
                      <p className="mt-2 text-sm font-black tabular-nums text-white">
                        {day.max}°/{day.min}°
                      </p>
                    </div>
                  ))}
                </div>

                {weatherOpen ? (
                  <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                    {weather.daily.slice(1).map((day) => (
                      <div className="grid grid-cols-[2.5rem_2rem_1fr_auto] items-center gap-3 text-sm font-bold" key={day.date}>
                        <span className="text-white/70">{formatWeatherDay(day.date)}</span>
                        <span className="text-2xl leading-none" aria-hidden="true">
                          {getWeatherIcon(day.code)}
                        </span>
                        <span className="text-white/55">{getWeatherLabel(day.code)}</span>
                        <span className="text-right tabular-nums text-white">
                          {day.max}° / {day.min}° · {day.rainChance}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-lg font-bold text-white/70">Clima no disponible</p>
            )}
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
    </main>
  );
}
