import io
import logging
import time

import requests

from .core import answer, chunks, image_caption, image_png, render, retry_loop

LOG = logging.getLogger(__name__)


class Telegram:
    def __init__(self, token: str):
        self.base = f"https://api.telegram.org/bot{token}/"
        self.session = requests.Session()
        self.rag_session = requests.Session()
        self.offset = None

    def call(self, method: str, data: dict, files=None) -> dict:
        response = self.session.post(self.base + method, data=data if files else None,
                                     json=None if files else data, files=files, timeout=45)
        response.raise_for_status()
        body = response.json()
        if not body.get("ok"):
            raise ValueError(f"Telegram {method}: {body.get('description')}")
        return body["result"]

    def handle(self, update: dict):
        message = update.get("message") or {}
        text = (message.get("text") or "").strip()
        chat = message.get("chat") or {}
        if not text or chat.get("type") != "private":
            return
        chat_id = chat["id"]
        if text.startswith(("/start", "/help")):
            self.call("sendMessage", {"chat_id": chat_id, "text": "🔭 Привет! Спроси меня об астрономии."})
            return
        try:
            result = answer(text, self.rag_session)
            for part in chunks(render(result), 4000):
                self.call("sendMessage", {"chat_id": chat_id, "text": part})
            for item in result.get("images", [])[:3]:
                data = image_png(item, self.rag_session)
                if data:
                    try:
                        self.call("sendPhoto", {"chat_id": chat_id, "caption": image_caption(item)},
                                  {"photo": ("illustration.png", io.BytesIO(data), "image/png")})
                    except (requests.RequestException, ValueError):
                        LOG.exception("Telegram: не удалось отправить изображение")
                time.sleep(0.55)
        except (requests.RequestException, RuntimeError, ValueError, KeyError) as exc:
            LOG.warning("Telegram: %s", exc)
            self.call("sendMessage", {"chat_id": chat_id, "text": str(exc) if isinstance(exc, RuntimeError) else "Помощник временно недоступен. Попробуй позже."})

    def poll(self):
        updates = self.call("getUpdates", {"offset": self.offset, "timeout": 30, "allowed_updates": ["message"]})
        for update in updates:
            self.offset = update["update_id"] + 1
            self.handle(update)

    def run(self):
        retry_loop(self.poll)
