import io
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from PIL import Image

from bot.core import chunks, image_png, render
from bot.max import Max
from bot.telegram import Telegram
from bot.webhook import Queue, make_handler


class Response:
    content = b""

    def raise_for_status(self):
        pass


class BotTests(unittest.TestCase):
    def test_render_uses_only_answer_sources(self):
        text = render({"answer": "Звезда светит.", "grounding": "knowledge_base",
                       "sources": [{"url": "/api/v1/terms/42"}], "images": []})
        self.assertIn("Звезда светит.", text)
        self.assertIn("/api/v1/terms/42", text)
        self.assertNotIn("Ответ модели", text)

    def test_long_text_is_split(self):
        parts = chunks("слово " * 1000, 3900)
        self.assertTrue(all(len(part) <= 3900 for part in parts))
        self.assertEqual(" ".join(parts), ("слово " * 1000).strip())

    def test_image_is_converted_to_png(self):
        source = io.BytesIO()
        Image.new("RGB", (4, 4), "red").save(source, "WEBP")
        response = Response()
        response.content = source.getvalue()
        class Session:
            def get(self, url, timeout):
                return response
        self.assertTrue(image_png({"url": "/api/v1/terms/1/illustration"}, Session()).startswith(b"\x89PNG"))

    def test_telegram_update_routes_question(self):
        bot = Telegram("test")
        with patch("bot.telegram.answer", return_value={"answer": "Ответ", "sources": [], "images": []}), patch.object(bot, "call") as call:
            bot.handle({"message": {"text": "Что такое звезда?", "chat": {"id": 12, "type": "private"}}})
        call.assert_called_once_with("sendMessage", {"chat_id": 12, "text": "✦ Астрономический помощник\n\nОтвет"})

    def test_max_update_routes_question(self):
        bot = Max("test")
        with patch("bot.max.answer", return_value={"answer": "Ответ", "sources": [], "images": []}), patch.object(bot, "send") as send:
            bot.handle({"update_type": "message_created",
                        "message": {"body": {"text": "Что такое звезда?"}, "sender": {"is_bot": False},
                                    "recipient": {"chat_id": 12, "chat_type": "dialog"}}})
        send.assert_called_once_with(12, "✦ Астрономический помощник\n\nОтвет")

    def test_max_webhook_checks_secret_and_queues_once(self):
        with tempfile.TemporaryDirectory() as directory:
            queue = Queue(directory + "/events.sqlite3")
            server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(queue, "secret-test"))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/webhooks/max"
                event = {"update_type": "message_created", "message": {"body": {"mid": "m1", "text": "вопрос"}}}
                body = json.dumps(event).encode()
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(url, data=body, method="POST"), timeout=2)
                self.assertEqual(error.exception.code, 403)
                error.exception.close()
                for _ in range(2):
                    response = urlopen(Request(url, data=body, method="POST",
                                               headers={"X-Max-Bot-Api-Secret": "secret-test"}), timeout=2)
                    self.assertEqual(response.status, 200)
                self.assertEqual(queue.first(), ("m1", event))
                queue.done("m1")
                self.assertIsNone(queue.first())
                queue.put(event)
                self.assertIsNone(queue.first())
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
