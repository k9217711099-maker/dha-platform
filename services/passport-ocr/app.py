"""
D H&A — self-hosted OCR-сайдкар распознавания паспорта РФ (152-ФЗ: скан никуда не
уходит, обработка локально). Движок — Tesseract (лёгкий, работает на VPS; русский +
латиница для MRZ). Контракт с HttpPassportAdapter:

  POST /recognize  body: { "image": "<base64>", "contentType": "image/jpeg" }
                   resp: { "fields": {...}, "confidence": 0..1, "source": "mrz|page", "note": "..." }
  GET  /health  -> { "status": "ok" }

fields (частично пустые, гость подтверждает вручную): series, number, lastName,
firstName, middleName, birthDate (YYYY-MM-DD). Точность OCR не 100%.
"""

from __future__ import annotations

import base64
import binascii
import io
import re
from datetime import datetime

import pytesseract
from fastapi import FastAPI
from PIL import Image, ImageOps
from pydantic import BaseModel

app = FastAPI(title="D H&A Passport OCR", version="2.0.0")

MRZ_CHARS = re.compile(r"^[A-Z0-9<]{28,}$")
NUM_RE = re.compile(r"\b(\d{2})\s?(\d{2})\s?(\d{6})\b")

# Фото паспорта с телефона бывают 4000+px по стороне — Tesseract на таких занимает
# CPU десятки секунд и тормозит весь сервер. Ресайз до 2200px по большей стороне
# ускоряет распознавание в разы, MRZ/текст остаются читаемыми.
MAX_DIM = 2200


def _prep(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM))  # пропорционально, только уменьшает
    return img


class RecognizeRequest(BaseModel):
    image: str
    contentType: str | None = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/recognize")
def recognize(req: RecognizeRequest) -> dict:
    try:
        raw = base64.b64decode(req.image, validate=False)
    except (binascii.Error, ValueError):
        return _empty("Некорректный base64 изображения.")
    try:
        img = _prep(Image.open(io.BytesIO(raw)))
    except Exception:  # noqa: BLE001
        return _empty("Не удалось открыть изображение.")

    texts = _ocr_lines(img)
    if not texts:
        return _empty("Текст не распознан — заполните поля вручную.")

    fields, source = _parse(texts)
    if not any(fields.values()):
        return _empty("Поля не извлечены — заполните вручную.")
    note = "Распознано по MRZ." if source == "mrz" else "Распознано по тексту страницы."
    return {"fields": fields, "confidence": 0.9 if source == "mrz" else 0.5, "source": source, "note": note}


def _ocr_lines(img: Image.Image) -> list[str]:
    try:
        text = pytesseract.image_to_string(img, lang="rus+eng")
    except pytesseract.TesseractError:
        text = pytesseract.image_to_string(img)
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _parse(texts: list[str]) -> tuple[dict, str]:
    mrz = _mrz_block(texts)
    fields: dict[str, str] = {}
    source = "page"
    if mrz:
        fields = _from_mrz(mrz)
        if fields:
            source = "mrz"
    if not fields.get("series") or not fields.get("number"):
        s, n = _find_series_number(texts)
        if s and n:
            fields.setdefault("series", s)
            fields.setdefault("number", n)
    if not fields.get("birthDate"):
        bd = _find_birthdate(texts)
        if bd:
            fields["birthDate"] = bd
    return {k: v for k, v in fields.items() if v}, source


def _mrz_block(texts: list[str]) -> list[str] | None:
    cand = [t.replace(" ", "").upper() for t in texts if MRZ_CHARS.match(t.replace(" ", "").upper())]
    if len(cand) < 2:
        return None
    for i in range(len(cand) - 1):
        if cand[i].startswith("PN"):
            return [cand[i], cand[i + 1]]
    return cand[-2:]


def _from_mrz(mrz: list[str]) -> dict:
    fields: dict[str, str] = {}
    line1, line2 = mrz[0], mrz[1]
    body = line1[5:] if line1.startswith("PNRUS") else line1
    surname, _, rest = body.partition("<<")
    names = [p for p in rest.split("<") if p]
    if surname:
        fields["lastName"] = _title(surname)
    if names:
        fields["firstName"] = _title(names[0])
    if len(names) > 1:
        fields["middleName"] = _title(names[1])
    m = re.search(r"RUS(\d{6})", line2)
    if m:
        bd = _yymmdd(m.group(1))
        if bd:
            fields["birthDate"] = bd
    return fields


def _find_series_number(texts: list[str]) -> tuple[str | None, str | None]:
    for t in texts:
        m = NUM_RE.search(t)
        if m:
            return f"{m.group(1)}{m.group(2)}", m.group(3)
    series = next((re.sub(r"\D", "", t) for t in texts if re.fullmatch(r"\d{2}\s?\d{2}", t.strip())), None)
    number = next((re.sub(r"\D", "", t) for t in texts if re.fullmatch(r"\d{6}", t.strip())), None)
    return series, number


def _find_birthdate(texts: list[str]) -> str | None:
    for t in texts:
        m = re.search(r"\b(\d{2})[.\-/](\d{2})[.\-/](\d{4})\b", t)
        if m:
            d, mo, y = m.groups()
            try:
                datetime(int(y), int(mo), int(d))
                return f"{y}-{mo}-{d}"
            except ValueError:
                continue
    return None


def _yymmdd(s: str) -> str | None:
    try:
        yy, mm, dd = int(s[0:2]), int(s[2:4]), int(s[4:6])
    except ValueError:
        return None
    if not (1 <= mm <= 12 and 1 <= dd <= 31):
        return None
    century = 1900 if yy > (datetime.now().year % 100) else 2000
    return f"{century + yy:04d}-{mm:02d}-{dd:02d}"


def _title(s: str) -> str:
    return s.replace("<", " ").strip().title()


def _empty(note: str) -> dict:
    return {"fields": {}, "confidence": 0.0, "source": "page", "note": note}
