import { useRef } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PhotoFile } from "./types";

interface Props {
  photos: PhotoFile[];
  isDragging: boolean;
  onFiles: (files: FileList | null) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onProcess: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export default function PhotoUploadZone({
  photos,
  isDragging,
  onFiles,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemove,
  onClearAll,
  onProcess,
  fileInputRef,
}: Props) {
  const processingCount = photos.filter((p) => p.status === "processing").length;
  const canProcess = photos.length > 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {photos.length < 10 && (
        <div
          className={`upload-zone rounded-2xl border-2 border-dashed transition-all duration-200 p-10 text-center cursor-pointer
            ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/20"}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
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
              onClick={onClearAll}
            >
              Очистить все
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {photos.map((photo, i) => (
              <div
                key={photo.id}
                className="photo-card relative rounded-xl overflow-hidden aspect-square bg-secondary animate-fade-in-up group"
                style={{
                  animationDelay: `${i * 0.04}s`,
                  opacity: 0,
                  animationFillMode: "forwards",
                }}
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

                {photo.status === "done" && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center justify-center shadow-sm">
                    <Icon name="Check" size={12} className="text-white" />
                  </div>
                )}

                {photo.status !== "processing" && (
                  <button
                    onClick={() => onRemove(photo.id)}
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

      {canProcess && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            className="flex-1 h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all glow-primary rounded-xl"
            onClick={onProcess}
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
                Уникализировать {photos.length} фото
              </span>
            )}
          </Button>
          {photos.some((p) => p.status === "done") && (
            <Button variant="outline" className="h-12 px-4 border-border rounded-xl">
              <Icon name="Download" size={16} className="mr-2" />
              Скачать все
            </Button>
          )}
        </div>
      )}

      {photos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground animate-fade-in-up stagger-3">
          <p className="text-sm">Загрузите фотографии выше, чтобы начать</p>
        </div>
      )}
    </div>
  );
}
