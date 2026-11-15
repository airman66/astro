# TulaHack 2026 — астрономический портал «Алкиона»

Один русскоязычный портал с единым адресом. Основной раздел (кейс 3) — дашборд NASA по экзопланетам: каталог кандидатов, методика отбора, карточки планет и ИИ-помощник. Дополнительный раздел (кейс 2) — интерактивные эксперименты, в том числе задача трёх тел. Справочник охватывает всю астрономию: 501 термин глоссария IAU OAE с русским переводом.

## Запуск

Нужны Docker и Docker Compose. В корне репозитория:

```sh
cp .env.example .env
# вписать DEEPSEEK_API_KEY и сгенерировать SESSION_SECRET (например: openssl rand -hex 32)
docker compose up --build -d
python3 scripts/smoke.py --skip-assistant
```

Портал: `http://localhost:8090`. Порт опубликован только на `127.0.0.1`. Все сервисы отвечают с одного origin: портал по `/`, Planets API по `/api/…`, справочник и помощник по `/api/v1/…`, общая OpenAPI по `/docs`. Полная карта маршрутов — [docs/API.md](docs/API.md).

Боты Telegram и MAX подключаются к тому же помощнику через профили Compose. Запуск, переменные окружения и ограничения — в [services/bots/README.md](services/bots/README.md).

По умолчанию запускаются **три контейнера**: `web` (nginx и собранный портал), `api` (FastAPI: каталог NASA, справочник и помощник), `redis` (общие лимиты запросов). .NET для запуска не нужен. Боты включаются профилями `telegram` и `max`.

Локальные эмбеддинги необязательны. Для гибридного поиска включите профиль; при первом запуске он скачает и проверит Qwen3-Embedding-8B (около 4,7 ГБ):

```sh
docker compose --profile embeddings up --build -d
# NVIDIA, при установленном NVIDIA Container Toolkit:
docker compose -f compose.yaml -f compose.gpu.yaml --profile embeddings up --build -d
```

Справочник и поиск работают и без эмбеддингов: тогда поиск только лексический, а ответ API честно сообщает `mode: "lexical"`. Без ключа DeepSeek, с отклонённым ключом или с нулевым балансом помощник отвечает `503 assistant_unavailable` с причиной; остальной портал работает.

Каталог NASA хранится в томе `catalog-data` и обновляется при запуске и каждые 6 часов. До первой загрузки `/api/status` отдаёт `ready: false`, а маршруты каталога — `503`; портал показывает ожидание и повторяет запрос сам. `docker compose down` сохраняет том, `down -v` удаляет его — так делать не нужно.

## Проверка

```sh
docker compose config
python3 scripts/smoke.py http://localhost:8090 --skip-assistant
cd services/glossary-rag && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m unittest discover -s tests -v
cd services/glossary-rag && .venv/bin/python -m app.audit && .venv/bin/python -m scripts.illustrations verify
cd services/portal && npm ci && npm run build && npm test
```

`smoke.py` проверяет web и единый API: каталог, справочник, фасеты, русский поиск, общую OpenAPI; с `--skip-assistant` запросов к помощнику нет. Для отдельной проверки лимита Redis можно убрать этот флаг (передаётся пустое невалидное тело, LLM не вызывается). `tests/test_planets.py` проверяет научные расчёты, воспроизводимость выборки, совместимость снимков .NET, HTTP-контракт и сбои архивов без внешней сети. Эталон численных ответов сохранён на синтетическом каталоге из исходной реализации .NET; для Python-тестов .NET не нужен. Если оригиналы медиа ещё не загружены, к smoke добавьте `--skip-source-media`: метаданные и локальные иллюстрации всё равно проверяются.

При переходе со старого стека:

```sh
docker compose up --build -d --remove-orphans
```

Не используйте `down -v`: именованный том `catalog-data` переиспользуется, снимки NASA/HWC читаются в прежнем формате. Старые контейнеры gateway, portal, planets-api и glossary-rag заменяются web и api. Справочник, медиа и индекс остаются в прежнем bind mount `services/glossary-rag/data`.

## Данные вне Git

В Git есть 501 каноническая запись термина, русские версии изображений, индекс RAG, манифест иллюстраций и отчёт ревью переводов. Нет: оригиналов изображений Astro4Edu (`data/media/original/`, 321 файл, около 1,5 ГБ), модели эмбеддингов, локальной SQLite и снимков NASA/HWC. Оригиналы восстанавливаются штатным импортом с проверкой SHA-256 по записям:

```sh
docker compose run --rm --no-deps api python -m app.importer --media-only --workers 4
```

SQLite справочника пересобирается сама, когда меняются канонические JSON.

## Структура

```text
services/portal/         фронтенд портала (Preact, TypeScript, Vite, D3), статика за nginx
services/planets-api/    архив исходной .NET-реализации и статического PoC; в стек не входит
services/glossary-rag/   общий FastAPI: NASA/HWC/архивы (app/planets), справочник, поиск, помощник
services/bots/           адаптеры Telegram и MAX для RAG-помощника
infra/gateway/           маршрутизация единого origin
docs/API.md              публичный контракт
scripts/smoke.py         интеграционная проверка через gateway
```

Правила работы и границы кейсов — в [AGENTS.md](AGENTS.md); у каждого сервиса свои `README.md` и `AGENTS.md`. Как продолжить незаконченные задачи (иллюстрации, оставшаяся часть ревью переводов) — в [HANDOFF.md](HANDOFF.md).
