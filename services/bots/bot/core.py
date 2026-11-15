import io
import logging
import os
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image, UnidentifiedImageError

LOG = logging.getLogger(__name__)
RAG_URL = os.getenv("RAG_URL", "http://glossary-rag:8000").rstrip("/")
PUBLIC_URL = os.getenv("PORTAL_PUBLIC_URL", "http://localhost:8090").rstrip("/")


def public_link(path: str) -> str | None:
    if not path:
        return None
    url = urljoin(PUBLIC_URL + "/", path)
    parsed = urlparse(url)
    if parsed.netloc != urlparse(PUBLIC_URL).netloc:
        return None
    term = re.fullmatch(r"/api/v1/terms/(\d+)/?", parsed.path)
    if term:
        parsed = parsed._replace(path=f"/glossary/{term[1]}")
    return parsed.geturl()


def answer(question: str, session: requests.Session) -> dict:
    response = session.post(
        RAG_URL + "/api/v1/assistant/answer",
        json={"question": question[:2000], "mode": "auto", "locale": "ru"},
        timeout=115,
    )
    if response.status_code == 429:
        wait = response.headers.get("Retry-After", "10")
        raise RuntimeError(f"Помощник пока занят. Повтори вопрос через {wait} с.")
    if response.status_code >= 400:
        LOG.warning("RAG HTTP %s: %s", response.status_code, response.text[:300])
        raise RuntimeError("Помощник временно недоступен. Попробуй позже.")
    return response.json()


def render(result: dict) -> str:
    lines = ["✦ Астрономический помощник", "", result["answer"].strip()]
    links = []
    for item in result.get("sources", []):
        url = public_link(item.get("url", ""))
        if url and url not in links:
            links.append(url)
    if not links:
        url = public_link(result.get("primary_url"))
        if url:
            links.append(url)
    if links:
        lines.extend(["", "📚 Материалы:", *[f"{i}. {url}" for i, url in enumerate(links[:3], 1)]])
    if result.get("grounding") == "model":
        lines.extend(["", "Ответ модели без источников справочника."])
    return "\n".join(lines)


def chunks(text: str, size: int) -> list[str]:
    parts = []
    while len(text) > size:
        cut = text.rfind("\n", 0, size)
        if cut < size // 2:
            cut = text.rfind(" ", 0, size)
        if cut < size // 2:
            cut = size
        parts.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        parts.append(text)
    return parts


def image_png(item: dict, session: requests.Session) -> bytes | None:
    path = item.get("url", "")
    parsed = urlparse(path)
    if parsed.scheme or not parsed.path.startswith("/api/v1/"):
        return None
    try:
        response = session.get(RAG_URL + path, timeout=20)
        response.raise_for_status()
        if len(response.content) > 10_000_000:
            return None
        with Image.open(io.BytesIO(response.content)) as image:
            image.thumbnail((1600, 1600))
            output = io.BytesIO()
            image.convert("RGB").save(output, "PNG", optimize=True)
            return output.getvalue()
    except (requests.RequestException, UnidentifiedImageError, OSError) as exc:
        LOG.warning("Изображение %s недоступно: %s", path, exc)
        return None


def image_caption(item: dict) -> str:
    caption = item.get("caption") or item.get("alt") or "Иллюстрация"
    credit = item.get("credit")
    return (f"🖼 {caption}" + (f"\n© {credit}" if credit else ""))[:900]


def retry_loop(run):
    delay = 2
    while True:
        try:
            run()
            delay = 2
        except (requests.RequestException, ValueError, KeyError) as exc:
            LOG.exception("Ошибка API: %s", exc)
            time.sleep(delay)
            delay = min(delay * 2, 30)
