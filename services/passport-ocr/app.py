"""
D H&A — self-hosted OCR-сайдкар для распознавания паспорта РФ (152-ФЗ: скан
никуда не уходит, обработка локально). Контракт согласован с HttpPassportAdapter
(apps/api/src/integrations/passport/http-passport.adapter.ts):

  POST /recognize
    body: { "image": "<base64>", "contentType": "image/jpeg" }
    resp: { "fields": {...}, "confidence": 0..1, "source": "mrz|page", "note": "..." }

  GET /health -> { "status": "ok" }

fields (частично могут быть пустыми, гость подтверждает вручную):
  series, number, lastName, firstName, middleName,
  birthDate (YYYY-MM-DD), issuedBy, issuedDate (YYYY-MM-DD)

Приоритет: машиночитаемая зона (MRZ, 2 строки внизу 2-й страницы) — самое
надёжное по ФИО и дате рождения; серия/номер дополнительно ищутся по видимому
тексту (как они напечатаны). Точность OCR не 100% — поэтому на стороне портала
гость обязательно подтверждает/правит поля (это часть регламента заселения).
"""

from __future__ import annotations

import base64
import binascii
import io
import re
from datetime import datetime

import numpy as np
from fastapi import FastAPI
from PIL import Image, ImageOps
from pydantic import BaseModel

# PaddleOCR инициализируется один раз (тяжёлая загрузка моделей). lang='ru'.
from paddleocr import PaddleOCR

app = FastAPI(title="D H&A Passport OCR", version="1.0.0")
_ocr = PaddleOCR(use_angle_cls=True, lang="ru", show_log=False)

MRZ_CHARS = re.compile(r"^[A-Z0-9<]{28,}$")
# Серия(4)+номер(6) как их печатают: «40 05 123456» / «4005 123456» / «4005123456».
NUM_RE = re.compile(r"\b(\d{2})\s?(\d{2})\s?(\d{6})\b")


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
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:  # noqa: BLE001 — любой битый файл → мягкий фолбэк
        return _empty("Не удалось открыть изображение.")

    lines = _ocr_lines(np.array(img))
    if not lines:
        return _empty("Текст не распознан — заполните поля вручную.")

    fields, source, confidence = _parse(lines)
    if not any(fields.values()):
        return _empty("Поля не извлечены — заполните вручную.")
    note = "Распознано по MRZ." if source == "mrz" else "Распознано по тексту страницы."
    return {"fields": fields, "confidence": round(confidence, 2), "source": source, "note": note}


def _ocr_lines(arr: np.ndarray) -> list[tuple[str, float]]:
    """PaddleOCR → [(text, confidence)] в порядке сверху вниз."""
    result = _ocr.ocr(arr, cls=True) or []
    out: list[tuple[str, float]] = []
    for page in result:
        for line in page or []:
            text, conf = line[1][0], float(line[1][1])
            if text and text.strip():
                out.append((text.strip(), conf))
    return out


def _parse(lines: list[tuple[str, float]]) -> tuple[dict, str, float]:
    texts = [t for t, _ in lines]
    confs = [c for _, c in lines]
    avg_conf = sum(confs) / len(confs) if confs else 0.0

    mrz = _mrz_block(texts)
    fields: dict[str, str] = {}
    source = "page"
    if mrz:
        fields = _from_mrz(mrz)
        if fields:
            source = "mrz"

    # Серия/номер — по видимому тексту (как напечатаны на паспорте).
    if not fields.get("series") or not fields.get("number"):
        s, n = _find_series_number(texts)
        if s and n:
            fields.setdefault("series", s)
            fields.setdefault("number", n)

    # Дата рождения из видимого текста, если MRZ не дал.
    if not fields.get("birthDate"):
        bd = _find_birthdate(texts)
        if bd:
            fields["birthDate"] = bd

    conf = 0.9 if source == "mrz" else min(0.6, avg_conf)
    return {k: v for k, v in fields.items() if v}, source, conf


def _mrz_block(texts: list[str]) -> list[str] | None:
    """Две нижние строки, похожие на MRZ (латиница/цифры/'<'), где одна начинается с PN."""
    cand = [t.replace(" ", "").upper() for t in texts if MRZ_CHARS.match(t.replace(" ", "").upper())]
    if len(cand) < 2:
        return None
    for i in range(len(cand) - 1):
        if cand[i].startswith("PN"):
            return [cand[i], cand[i + 1]]
    return cand[-2:]


def _from_mrz(mrz: list[str]) -> dict:
    """ФИО из строки 1 (после PNRUS), дата рождения из строки 2 (RUS<YYMMDD>)."""
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
    # Отдельно стоящие «4005» и «123456».
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
