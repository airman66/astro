import io
import logging
import time

import requests

from .core import answer, chunks, image_caption, image_png, render

LOG = logging.getLogger(__name__)


class Max:
    def __init__(self, token: str):
        self.base = "https://platform-api2.max.ru"
        self.session = requests.Session()
        self.session.headers.update({"Authorization": token})
        self.rag_session = requests.Session()

    def call(self, method: str, path: str, **kwargs) -> dict:
        response = self.session.request(method, self.base + path, timeout=kwargs.pop("timeout", 45), **kwargs)
        response.raise_for_status()
        body = response.json()
        if body.get("success") is False:
            raise ValueError(f"MAX {path}: {body.get('code', body.get('message'))}")
        return body

    def send(self, chat_id: int, text: str = "", attachments=None):
        body = {"text": text}
        if attachments:
            body["attachments"] = attachments
        self.call("POST", "/messages", params={"chat_id": chat_id}, json=body)

    def handle(self, update: dict):
        if update.get("update_type") != "message_created":
            return
        message = update.get("message") or {}
        sender = message.get("sender") or {}
        recipient = message.get("recipient") or {}
        if sender.get("is_bot") or update.get("is_channel") or recipient.get("chat_type") == "channel":
            return
        text = ((message.get("body") or {}).get("text") or "").strip()
        chat_id = update.get("chat_id") or recipient.get("chat_id")
        if not text or not chat_id:
            return
        if text.startswith(("/start", "/help")):
            self.send(chat_id, "🔭 Привет! Спроси меня об астрономии.")
            return
        try:
            result = answer(text, self.rag_session)
            for part in chunks(render(result), 3900):
                self.send(chat_id, part)
                time.sleep(0.55)
            for item in result.get("images", [])[:3]:
                data = image_png(item, self.rag_session)
                if data:
                    try:
                        upload = self.call("POST", "/uploads", params={"type": "image"})
                        response = requests.post(upload["url"],
                                                 files={"data": ("illustration.png", io.BytesIO(data), "image/png")}, timeout=45)
                        response.raise_for_status()
                        token = response.json()["token"]
                        self.send(chat_id, image_caption(item), [{"type": "image", "payload": {"token": token}}])
                    except (requests.RequestException, ValueError, KeyError):
                        LOG.exception("MAX: не удалось отправить изображение")
                time.sleep(0.55)
        except (requests.RequestException, RuntimeError, ValueError, KeyError) as exc:
            LOG.warning("MAX: %s", exc)
            self.send(chat_id, str(exc) if isinstance(exc, RuntimeError) else "Помощник временно недоступен. Попробуй позже.")
