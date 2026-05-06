"""
Обработка фотографий через fal.ai — замена фона с сохранением объекта + изменение метаданных EXIF.
"""
import os
import json
import base64
import time
import random
import requests
import piexif
import boto3
from io import BytesIO
from PIL import Image


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

FAL_KEY = "8db4e61d-4fd1-46b1-8248-6640089bf8eb:67618724fbe5de08011d1e6e7cefc656"


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def upload_to_s3(image_bytes: bytes, filename: str) -> str:
    s3 = get_s3()
    key = f"photo-process/{filename}"
    s3.put_object(Bucket="files", Key=key, Body=image_bytes, ContentType="image/jpeg")
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    return cdn_url


def randomize_exif(prompt: str) -> bytes:
    try:
        exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}}
        cameras = [
            ("Canon", "Canon EOS R5"),
            ("Nikon", "Nikon Z9"),
            ("Sony", "ILCE-7M4"),
            ("Fujifilm", "X-T5"),
            ("Leica", "Leica M11"),
        ]
        idx = abs(hash(prompt + str(time.time()))) % len(cameras)
        make, model = cameras[idx]
        exif_dict["0th"][piexif.ImageIFD.Make] = make.encode()
        exif_dict["0th"][piexif.ImageIFD.Model] = model.encode()
        exif_dict["0th"][piexif.ImageIFD.Software] = b"Adobe Lightroom 13.0"

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

        exif_dict["Exif"][piexif.ExifIFD.ISOSpeedRatings] = random.choice([100, 125, 160, 200, 250, 320, 400, 500])
        exif_dict["Exif"][piexif.ExifIFD.ExposureTime] = random.choice([(1, 100), (1, 200), (1, 250), (1, 500), (1, 1000)])
        exif_dict["Exif"][piexif.ExifIFD.FNumber] = random.choice([(14, 5), (18, 5), (20, 5), (28, 5), (40, 5)])
        exif_dict["Exif"][piexif.ExifIFD.FocalLength] = random.choice([(35, 1), (50, 1), (85, 1), (100, 1), (135, 1)])

        unique_id = f"FAL{int(time.time())}{random.randint(1000, 9999)}"
        exif_dict["Exif"][piexif.ExifIFD.ImageUniqueID] = unique_id.encode()

        return piexif.dump(exif_dict)
    except Exception:
        return b""


def fal_run(endpoint: str, payload: dict, fal_key: str) -> dict:
    """Отправляет задачу в fal.ai queue и ждёт результата."""
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    # Submit
    submit_resp = requests.post(
        f"https://queue.fal.run/{endpoint}",
        headers=headers,
        json=payload,
        timeout=30,
    )
    print(f"Submit status: {submit_resp.status_code}, body: {submit_resp.text[:300]}")
    submit_resp.raise_for_status()
    request_id = submit_resp.json()["request_id"]

    # Poll until done
    for _ in range(60):
        time.sleep(3)
        status_resp = requests.get(
            f"https://queue.fal.run/{endpoint}/requests/{request_id}/status",
            headers=headers,
            timeout=10,
        )
        status_data = status_resp.json()
        status = status_data.get("status")
        print(f"Poll status: {status}")

        if status == "COMPLETED":
            result_resp = requests.get(
                f"https://queue.fal.run/{endpoint}/requests/{request_id}",
                headers=headers,
                timeout=30,
            )
            return result_resp.json()
        elif status in ("FAILED", "CANCELLED"):
            raise Exception(f"fal.ai job failed: {status_data}")

    raise Exception("fal.ai timeout after 180s")


def handler(event: dict, context) -> dict:
    """Принимает base64 фото, загружает в S3, отправляет в fal.ai queue, возвращает обработанное фото с новыми EXIF."""

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    body = json.loads(event.get("body", "{}"))
    image_b64 = body.get("image")
    prompt = body.get("prompt", "Change background to beautiful nature scene, keep main subject absolutely unchanged.")
    strength = float(body.get("strength", 0.7))

    if not image_b64:
        return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "No image provided"})}

    # Декодируем и сжимаем до 1024px
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    image_bytes = base64.b64decode(image_b64)

    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    max_size = 1024
    if max(img.size) > max_size:
        ratio = max_size / max(img.size)
        new_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    compressed_bytes = buf.getvalue()

    # Загружаем в S3
    filename = f"input_{int(time.time())}_{random.randint(1000, 9999)}.jpg"
    image_url = upload_to_s3(compressed_bytes, filename)
    print(f"Uploaded to S3: {image_url}")

    fal_key = os.environ.get("FAL_API_KEY", FAL_KEY)

    payload = {
        "prompt": prompt,
        "image_url": image_url,
        "strength": strength,
        "num_inference_steps": 28,
        "guidance_scale": 3.5,
    }

    result = fal_run("fal-ai/flux/dev/image-to-image", payload, fal_key)
    print(f"fal.ai result keys: {list(result.keys())}")

    result_url = result["images"][0]["url"]

    # Скачиваем результат
    img_resp = requests.get(result_url, timeout=60)
    result_bytes = img_resp.content

    # Добавляем рандомные EXIF
    result_img = Image.open(BytesIO(result_bytes)).convert("RGB")
    new_exif = randomize_exif(prompt)
    out_buf = BytesIO()
    save_kwargs = {"format": "JPEG", "quality": 95}
    if new_exif:
        save_kwargs["exif"] = new_exif
    result_img.save(out_buf, **save_kwargs)

    result_b64 = base64.b64encode(out_buf.getvalue()).decode()

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "result": f"data:image/jpeg;base64,{result_b64}",
            "exif_randomized": True,
        }),
    }
