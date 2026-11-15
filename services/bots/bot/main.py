import logging
import os

from .max import Max
from .telegram import Telegram
from .webhook import serve_max


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    platform = os.environ["BOT_PLATFORM"]
    if platform == "telegram":
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN не задан")
        Telegram(token).run()
    elif platform == "max":
        token = os.environ.get("MAX_BOT_TOKEN")
        if not token:
            raise ValueError("MAX_BOT_TOKEN не задан")
        serve_max(Max(token), os.environ["MAX_WEBHOOK_URL"], os.environ["MAX_WEBHOOK_SECRET"])
    else:
        raise ValueError(f"Неизвестная платформа: {platform}")


if __name__ == "__main__":
    main()
