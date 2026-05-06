export interface PhotoFile {
  id: string;
  file: File;
  preview: string;
  status: "idle" | "processing" | "done" | "error";
  result?: string;
}

export type OptionGroup = {
  label: string;
  key: string;
  options: { value: string; label: string; emoji: string }[];
};

export const OPTION_GROUPS: OptionGroup[] = [
  {
    label: "Фон",
    key: "background",
    options: [
      { value: "city", label: "Город", emoji: "🏙️" },
      { value: "nature", label: "Природа", emoji: "🌿" },
      { value: "studio", label: "Студия", emoji: "🎞️" },
      { value: "abstract", label: "Абстракция", emoji: "🌀" },
      { value: "beach", label: "Пляж", emoji: "🏖️" },
      { value: "mountains", label: "Горы", emoji: "⛰️" },
    ],
  },
  {
    label: "Погода",
    key: "weather",
    options: [
      { value: "sunny", label: "Солнечно", emoji: "☀️" },
      { value: "cloudy", label: "Облачно", emoji: "⛅" },
      { value: "rain", label: "Дождь", emoji: "🌧️" },
      { value: "snow", label: "Снег", emoji: "❄️" },
      { value: "fog", label: "Туман", emoji: "🌫️" },
      { value: "storm", label: "Гроза", emoji: "⛈️" },
    ],
  },
  {
    label: "Сезон",
    key: "season",
    options: [
      { value: "spring", label: "Весна", emoji: "🌸" },
      { value: "summer", label: "Лето", emoji: "🌞" },
      { value: "autumn", label: "Осень", emoji: "🍂" },
      { value: "winter", label: "Зима", emoji: "🌨️" },
    ],
  },
  {
    label: "Растительность",
    key: "vegetation",
    options: [
      { value: "lush", label: "Пышная", emoji: "🌳" },
      { value: "dry", label: "Сухая", emoji: "🌾" },
      { value: "tropical", label: "Тропики", emoji: "🌴" },
      { value: "none", label: "Без растений", emoji: "🏜️" },
      { value: "flowers", label: "Цветы", emoji: "🌺" },
    ],
  },
];

export const STYLE_PRESETS = [
  { value: "realistic", label: "Реализм", emoji: "📷" },
  { value: "cinematic", label: "Кино", emoji: "🎬" },
  { value: "artistic", label: "Арт", emoji: "🎨" },
  { value: "vintage", label: "Винтаж", emoji: "🕰️" },
  { value: "minimalist", label: "Минимализм", emoji: "◻️" },
];

export function buildPrompt(
  selections: Record<string, string>,
  style: string,
  customPrompt: string,
  details: string
): string {
  const parts: string[] = [
    "Change only the background environment of this photo, keep the main subject absolutely unchanged and in the exact same position.",
  ];

  const bg = OPTION_GROUPS[0].options.find((o) => o.value === selections["background"]);
  const weather = OPTION_GROUPS[1].options.find((o) => o.value === selections["weather"]);
  const season = OPTION_GROUPS[2].options.find((o) => o.value === selections["season"]);
  const veg = OPTION_GROUPS[3].options.find((o) => o.value === selections["vegetation"]);

  if (bg) parts.push(`Background: ${bg.label} scene`);
  if (weather) parts.push(`Weather: ${weather.label}`);
  if (season) parts.push(`Season: ${season.label}`);
  if (veg) parts.push(`Vegetation: ${veg.label}`);

  const stylePreset = STYLE_PRESETS.find((s) => s.value === style);
  if (stylePreset) parts.push(`Style: ${stylePreset.label} photography`);

  if (customPrompt.trim()) parts.push(customPrompt.trim());
  if (details.trim()) parts.push(`Additional details: ${details.trim()}`);

  return parts.join(". ");
}
