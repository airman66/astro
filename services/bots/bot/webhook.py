import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = logging.getLogger(__name__)
PATH = "/webhooks/max"


class Queue:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0)")
            self.db.commit()

    def put(self, event: dict):
        body = ((event.get("message") or {}).get("body") or {})
        event_id = body.get("mid") or hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
        with self.lock:
            self.db.execute("INSERT OR IGNORE INTO events (id, payload) VALUES (?, ?)", (str(event_id), json.dumps(event)))
            self.db.commit()

    def first(self):
        with self.lock:
            row = self.db.execute("SELECT id, payload FROM events WHERE done = 0 ORDER BY rowid LIMIT 1").fetchone()
        return (row[0], json.loads(row[1])) if row else None

    def done(self, event_id: str):
        with self.lock:
            self.db.execute("UPDATE events SET done = 1 WHERE id = ?", (event_id,))
            self.db.commit()


def make_handler(queue: Queue, secret: str):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != PATH:
                self.send_error(404)
                return
            supplied = self.headers.get("X-Max-Bot-Api-Secret", "")
            if not hmac.compare_digest(supplied, secret):
                self.send_error(403)
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 65536:
                self.send_error(413)
                return
            try:
                event = json.loads(self.rfile.read(length))
                if not isinstance(event, dict) or not isinstance(event.get("update_type"), str):
                    raise ValueError("invalid update")
                queue.put(event)
            except (ValueError, TypeError, sqlite3.Error):
                LOG.exception("MAX webhook: некорректное событие или очередь недоступна")
                self.send_error(400)
                return
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format, *args):
            LOG.info("MAX webhook: " + format, *args)

    return Handler


def process(queue: Queue, bot):
    while True:
        item = queue.first()
        if item is None:
            time.sleep(0.5)
            continue
        event_id, event = item
        try:
            bot.handle(event)
            queue.done(event_id)
        except Exception:
            LOG.exception("MAX webhook: обработка не удалась, повтор через 5 секунд")
            time.sleep(5)


def serve_max(bot, url: str, secret: str):
    if not url.startswith("https://") or not url.endswith(PATH):
        raise ValueError("MAX_WEBHOOK_URL должен быть HTTPS-адресом /webhooks/max")
    if not re.fullmatch(r"[A-Za-z0-9_-]{5,256}", secret):
        raise ValueError("MAX_WEBHOOK_SECRET должен содержать 5–256 букв, цифр, _ или -")
    queue = Queue(os.getenv("MAX_QUEUE_DB", "/app/queue/events.sqlite3"))
    server = ThreadingHTTPServer(("0.0.0.0", 8080), make_handler(queue, secret))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    bot.call("POST", "/subscriptions", json={"url": url, "update_types": ["message_created"], "secret": secret})
    LOG.info("MAX webhook: подписка установлена, слушаем %s", PATH)
    process(queue, bot)
