import { useState, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

// --- Types ---
interface PhotoFile {
  id: string;
  file: File;
  preview: string;
  status: "idle" | "processing" | "done" | "error";
  result?: string;
}

type OptionGroup = {
  label: string;
  key: string;
  options: { value: string; label: string; emoji: string }[];
};

// --- Data ---
const OPTION_GROUPS: OptionGroup[] = [
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

const STYLE_PRESETS = [
  { value: "realistic", label: "Реализм", emoji: "📷" },
  { value: "cinematic", label: "Кино", emoji: "🎬" },
  { value: "artistic", label: "Арт", emoji: "🎨" },
  { value: "vintage", label: "Винтаж", emoji: "🕰️" },
  { value: "minimalist", label: "Минимализм", emoji: "◻️" },
];

function buildPrompt(
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

export default function Index() {
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [style, setStyle] = useState("realistic");
  const [customPrompt, setCustomPrompt] = useState("");
  const [details, setDetails] = useState("");
  const [strength, setStrength] = useState([0.7]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "prompt">("settings");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const allowed = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, 10 - photos.length);
      const newPhotos: PhotoFile[] = allowed.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        status: "idle",
      }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    },
    [photos.length]
  );

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const toggleSelection = (key: string, value: string) => {
    setSelections((prev) =>
      prev[key] === value ? { ...prev, [key]: "" } : { ...prev, [key]: value }
    );
  };

  const fullPrompt = buildPrompt(selections, style, customPrompt, details);
  const canProcess = photos.length > 0;
  const processingCount = photos.filter((p) => p.status === "processing").length;

  const processPhoto = async (photo: PhotoFile, prompt: string, strength: number) => {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    const imageB64 = await toBase64(photo.file);

    const resp = await fetch(
      "https://functions.poehali.dev/4be1eaf0-3470-4a72-8fc8-0a8b58609958",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageB64, prompt, strength }),
      }
    );

    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || "Ошибка обработки");
    return data.result as string;
  };

  const handleProcess = async () => {
    const idlePhotos = photos.filter((p) => p.status === "idle");
    setPhotos((prev) =>
      prev.map((p) => (p.status === "idle" ? { ...p, status: "processing" } : p))
    );

    for (const photo of idlePhotos) {
      try {
        const result = await processPhoto(photo, fullPrompt, strength[0]);
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: "done", result } : p))
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: "error" } : p))
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-background font-golos">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm bg-background/90">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-primary text-sm font-bold">✦</span>
          </div>
          <div>
            <h1 className="font-semibold text-foreground leading-none">PhotoUniq</h1>
            <p className="text-xs text-muted-foreground">уникализатор фотографий</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="Images" size={14} />
          <span>{photos.length} / 10 фото</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        {/* Left: Upload + Gallery */}
        <div className="space-y-6 animate-fade-in-up">
          {/* Upload Zone */}
          {photos.length < 10 && (
            <div
              className={`upload-zone rounded-2xl border-2 border-dashed transition-all duration-200 p-10 text-center cursor-pointer
                ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/20"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div
                className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all
                ${isDragging ? "bg-primary/20 scale-110" : "bg-secondary"}`}
              >
                <Icon
                  name="Upload"
                  size={26}
                  className={isDragging ? "text-primary" : "text-muted-foreground"}
                />
              </div>
              <p className="font-semibold text-foreground mb-1.5 text-lg">
                {isDragging ? "Отпустите файлы" : "Перетащите фотографии"}
              </p>
              <p className="text-sm text-muted-foreground">
                или нажмите для выбора · до {10 - photos.length} фото · JPG, PNG, WEBP
              </p>
            </div>
          )}

          {/* Photo Grid */}
          {photos.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">
                  Фотографии{" "}
                  <span className="text-muted-foreground font-normal text-sm">
                    ({photos.length})
                  </span>
                </h2>
                <button
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => setPhotos([])}
                >
                  Очистить все
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {photos.map((photo, i) => (
                  <div
                    key={photo.id}
                    className="photo-card relative rounded-xl overflow-hidden aspect-square bg-secondary animate-fade-in-up group"
                    style={{ animationDelay: `${i * 0.04}s`, opacity: 0, animationFillMode: "forwards" }}
                  >
                    <img
                      src={photo.result || photo.preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />

                    {photo.status === "processing" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
                        <span className="text-xs text-muted-foreground">Обработка...</span>
                      </div>
                    )}

                    {photo.status === "error" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                        <Icon name="AlertCircle" size={22} className="text-destructive mb-1" />
                        <span className="text-xs text-destructive">Ошибка</span>
                      </div>
                    )}

                    {photo.status === "done" && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <Icon name="Check" size={12} className="text-white" />
                      </div>
                    )}

                    {photo.status !== "processing" && (
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-2 left-2 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icon name="X" size={10} className="text-foreground" />
                      </button>
                    )}

                    {photo.status === "done" && photo.result && (
                      <a
                        href={photo.result}
                        download={`uniq_${photo.file.name}`}
                        className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Icon name="Download" size={12} className="text-primary-foreground" />
                      </a>
                    )}
                  </div>
                ))}

                {photos.length < 10 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center transition-all hover:bg-accent/20"
                  >
                    <Icon name="Plus" size={20} className="text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Process Button */}
          {canProcess && (
            <div className="flex items-center gap-3 pt-2">
              <Button
                className="flex-1 h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all glow-primary rounded-xl"
                onClick={handleProcess}
                disabled={processingCount > 0}
              >
                {processingCount > 0 ? (
                  <span className="flex items-center gap-2 progress-pulse">
                    <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    Обрабатывается {processingCount} из {photos.length}...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Icon name="Sparkles" size={18} />
                    Уникализировать {photos.length}{" "}
                    {photos.length === 1 ? "фото" : "фото"}
                  </span>
                )}
              </Button>
              {photos.some((p) => p.status === "done") && (
                <Button
                  variant="outline"
                  className="h-12 px-4 border-border rounded-xl"
                >
                  <Icon name="Download" size={16} className="mr-2" />
                  Скачать все
                </Button>
              )}
            </div>
          )}

          {/* Empty state */}
          {photos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground animate-fade-in-up stagger-3">
              <p className="text-sm">Загрузите фотографии выше, чтобы начать</p>
            </div>
          )}
        </div>

        {/* Right: Settings Panel */}
        <div className="space-y-5 animate-fade-in-up stagger-2">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors ${
                  activeTab === "settings"
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("settings")}
              >
                Настройки
              </button>
              <button
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors ${
                  activeTab === "prompt"
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("prompt")}
              >
                Промпт
              </button>
            </div>

            <div className="p-5 space-y-6">
              {activeTab === "settings" ? (
                <>
                  {/* Style presets */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      Стиль
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {STYLE_PRESETS.map((s) => (
                        <button
                          key={s.value}
                          className={`chip ${style === s.value ? "active" : ""}`}
                          onClick={() => setStyle(s.value)}
                        >
                          <span>{s.emoji}</span>
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Option groups */}
                  {OPTION_GROUPS.map((group) => (
                    <div key={group.key}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.options.map((opt) => (
                          <button
                            key={opt.value}
                            className={`chip ${
                              selections[group.key] === opt.value ? "active" : ""
                            }`}
                            onClick={() => toggleSelection(group.key, opt.value)}
                          >
                            <span>{opt.emoji}</span>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Strength */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Интенсивность
                      </p>
                      <span className="text-xs font-semibold text-primary">
                        {Math.round(strength[0] * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={strength}
                      onValueChange={setStrength}
                      min={0.1}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>Мягко</span>
                      <span>Интенсивно</span>
                    </div>
                  </div>

                  {/* Details */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      Дополнительные детали
                    </p>
                    <Textarea
                      placeholder="Например: добавь нежное боке, розовые цветы на переднем плане..."
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      className="resize-none h-20 bg-secondary border-border text-sm placeholder:text-muted-foreground/40 focus:border-primary/50"
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Custom prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Свой промпт
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        добавляется к настройкам
                      </span>
                    </div>
                    <Textarea
                      placeholder="Напишите свои инструкции для AI..."
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      className="resize-none h-28 bg-secondary border-border text-sm placeholder:text-muted-foreground/40 focus:border-primary/50"
                    />
                  </div>

                  {/* Preview of full prompt */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      Итоговый промпт
                    </p>
                    <div className="rounded-xl bg-secondary/50 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed font-mono break-words">
                      {fullPrompt}
                    </div>
                    <button
                      className="mt-2 text-xs text-primary hover:text-primary/70 transition-colors flex items-center gap-1"
                      onClick={() => navigator.clipboard.writeText(fullPrompt)}
                    >
                      <Icon name="Copy" size={11} />
                      Скопировать промпт
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="ShieldCheck" size={14} className="text-primary" />
              </div>
              <div className="text-sm space-y-1">
                <p className="font-medium text-foreground">Объект сохраняется</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Главный объект на каждой фотографии остаётся нетронутым — меняется только окружение и атмосфера.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}