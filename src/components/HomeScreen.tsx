import { useEffect, useMemo, useState } from "react";
import {
  fetchFranckWeather,
  formatWeatherDay,
  getWeatherLabel,
  type WeatherData,
} from "../utils/weather";

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
        <div className="flex justify-end">
          <button
            type="button"
            className="min-w-56 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur transition active:scale-[0.98]"
            onClick={(event) => {
              event.stopPropagation();
              setWeatherOpen((current) => !current);
            }}
          >
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white/50">Franck, Santa Fe</p>
            {weather ? (
              <>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="text-5xl font-black leading-none">{weather.currentTemp}°</p>
                  <p className="pb-1 text-right text-sm font-bold text-white/70">
                    {getWeatherLabel(weather.currentCode)}
                  </p>
                </div>
                {weatherOpen ? (
                  <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                    {weather.daily.slice(1).map((day) => (
                      <div className="flex items-center justify-between gap-5 text-sm font-bold" key={day.date}>
                        <span className="text-white/70">{formatWeatherDay(day.date)}</span>
                        <span className="text-white/55">{getWeatherLabel(day.code)}</span>
                        <span className="tabular-nums text-white">
                          {day.max}° / {day.min}°
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
