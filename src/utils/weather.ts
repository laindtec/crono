export type DailyWeather = {
  date: string;
  max: number;
  min: number;
  code: number;
  rainChance: number;
};

export type WeatherData = {
  currentTemp: number;
  apparentTemp: number;
  humidity: number;
  windSpeed: number;
  currentCode: number;
  isDay: boolean;
  daily: DailyWeather[];
};

const FRANCK_LATITUDE = -31.586;
const FRANCK_LONGITUDE = -60.94;

export function getWeatherLabel(code: number): string {
  if (code === 0) return "Despejado";
  if ([1, 2].includes(code)) return "Algo nublado";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Niebla";
  if ([51, 53, 55, 56, 57].includes(code)) return "Llovizna";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Lluvia";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Nieve";
  if ([95, 96, 99].includes(code)) return "Tormenta";
  return "Variable";
}

export function getWeatherIcon(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀" : "☾";
  if ([1, 2].includes(code)) return isDay ? "🌤" : "☁";
  if (code === 3) return "☁";
  if ([45, 48].includes(code)) return "≋";
  if ([51, 53, 55, 56, 57].includes(code)) return "☂";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "☔";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "⚡";
  return "◌";
}

export function formatWeatherDay(date: string): string {
  const parsedDate = new Date(`${date}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(parsedDate);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
}

export async function fetchFranckWeather(): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(FRANCK_LATITUDE),
    longitude: String(FRANCK_LONGITUDE),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "America/Argentina/Cordoba",
    forecast_days: "6",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Weather request failed");
  }

  const data = (await response.json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      weather_code: number;
      wind_speed_10m: number;
      is_day: number;
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };

  return {
    currentTemp: Math.round(data.current.temperature_2m),
    apparentTemp: Math.round(data.current.apparent_temperature),
    humidity: Math.round(data.current.relative_humidity_2m),
    windSpeed: Math.round(data.current.wind_speed_10m),
    currentCode: data.current.weather_code,
    isDay: data.current.is_day === 1,
    daily: data.daily.time.map((date, index) => ({
      date,
      max: Math.round(data.daily.temperature_2m_max[index]),
      min: Math.round(data.daily.temperature_2m_min[index]),
      code: data.daily.weather_code[index],
      rainChance: Math.round(data.daily.precipitation_probability_max[index] ?? 0),
    })),
  };
}
