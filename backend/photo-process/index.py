"""
Обработка фотографий через fal.ai — замена фона с сохранением объекта + изменение метаданных EXIF.
"""
import os
import json
import base64
import time
import requests
import piexif
from io import BytesIO
from PIL import Image


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def randomize_exif(exif_bytes: bytes | None, prompt: str) -> bytes:
    """Создаёт новые рандомизированные EXIF-метаданные."""
    try:
        exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}}

        # Случайная камера на основе хеша промпта
        cameras = [
            ("Canon", "Canon EOS R5"),
            ("Nikon", "Nikon Z9"),
            ("Sony", "ILCE-7M4"),
            ("Fujifilm", "X-T5"),
            ("Leica", "Leica M11"),
        ]
        idx = hash(prompt + str(time.time())) % len(cameras)
        make, model = cameras[idx]

        exif_dict["0th"][piexif.ImageIFD.Make] = make.encode()
        exif_dict["0th"][piexif.ImageIFD.Model] = model.encode()
        exif_dict["0th"][piexif.ImageIFD.Software] = b"Adobe Lightroom 13.0"

        # Рандомные дата/время
        import random
        year = random.randint(2022, 2024)
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        hour = random.randint(8, 18)
        minute = random.randint(0, 59)
        second = random.randint(0, 59)
        dt_str = f"{year}:{month:02d}:{day:02d} {hour:02d}:{minute:02d}:{second:02d}"
        exif_dict["0th"][piexif.ImageIFD.DateTime] = dt_str.encode()
        exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = dt_str.encode()
        exif_dict["Exif"][piexif.ExifIFD.DateTimeDigitized] = dt_str.encode()

        # Рандомные параметры съёмки
        isos = [100, 125, 160, 200, 250, 320, 400, 500, 640, 800]
        exif_dict["Exif"][piexif.ExifIFD.ISOSpeedRatings] = random.choice(isos)

        shutters = [(1, 100), (1, 200), (1, 250), (1, 500), (1, 1000), (1, 2000)]
        shutter = random.choice(shutters)
        exif_dict["Exif"][piexif.ExifIFD.ExposureTime] = shutter

        apertures = [(14, 5), (18, 5), (20, 5), (28, 5), (40, 5), (56, 5)]
        exif_dict["Exif"][piexif.ExifIFD.FNumber] = random.choice(apertures)

        focal_lengths = [(35, 1), (50, 1), (85, 1), (100, 1), (135, 1)]
        exif_dict["Exif"][piexif.ExifIFD.FocalLength] = random.choice(focal_lengths)

        # Уникальный ID изображения
        unique_id = f"FAL{int(time.time())}{random.randint(1000, 9999)}"
        exif_dict["Exif"][piexif.ExifIFD.ImageUniqueID] = unique_id.encode()

        return piexif.dump(exif_dict)
    except Exception:
        return b""


def handler(event: dict, context) -> dict:
    """Обрабатывает фото через fal.ai: меняет фон, сохраняет объект, рандомизирует EXIF."""

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    fal_key = os.environ.get("FAL_API_KEY", "8db4e61d-4fd1-46b1-8248-6640089bf8eb:67618724fbe5de08011d1e6e7cefc656")

    body = json.loads(event.get("body", "{}"))
    image_b64 = body.get("image")
    prompt = body.get("prompt", "Change background to nature scene, keep main subject unchanged.")
    strength = float(body.get("strength", 0.7))

    if not image_b64:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "No image provided"}),
        }

    # Декодируем входное изображение
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    image_bytes = base64.b64decode(image_b64)

    # Конвертируем в PNG для fal.ai
    img = Image.open(BytesIO(image_bytes))
    original_format = img.format or "JPEG"
    buf = BytesIO()
    img.save(buf, format="PNG")
    png_b64 = base64.b64encode(buf.getvalue()).decode()
    image_url = f"data:image/png;base64,{png_b64}"

    # Вызываем fal.ai — модель flux-kontext (замена фона с сохранением объекта)
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "prompt": prompt,
        "image_url": image_url,
        "strength": strength,
        "num_inference_steps": 28,
        "guidance_scale": 3.5,
    }

    resp = requests.post(
        "https://fal.run/fal-ai/flux/dev/image-to-image",
        headers=headers,
        json=payload,
        timeout=120,
    )

    if resp.status_code != 200:
        return {
            "statusCode": 502,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"fal.ai error: {resp.text}"}),
        }

    result = resp.json()
    result_url = result["images"][0]["url"]

    # Скачиваем результат
    img_resp = requests.get(result_url, timeout=60)
    result_bytes = img_resp.content

    # Открываем результат и вставляем рандомные EXIF
    result_img = Image.open(BytesIO(result_bytes))
    new_exif = randomize_exif(None, prompt)

    out_buf = BytesIO()
    save_kwargs = {"format": "JPEG", "quality": 95}
    if new_exif:
        save_kwargs["exif"] = new_exif
    result_img.convert("RGB").save(out_buf, **save_kwargs)

    result_b64 = base64.b64encode(out_buf.getvalue()).decode()

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "result": f"data:image/jpeg;base64,{result_b64}",
            "exif_randomized": True,
        }),
    }
