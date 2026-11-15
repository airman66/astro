# TulaHack 2026 — астрономический портал «Алкиона»

Один русскоязычный портал с единым адресом. Основной раздел (кейс 3) — дашборд NASA по экзопланетам: каталог кандидатов, методика отбора, карточки планет и ИИ-помощник. Дополнительный раздел (кейс 2) — интерактивные эксперименты, в том числе задача трёх тел. Справочник охватывает всю астрономию: 501 термин глоссария IAU OAE с русским переводом.

## Запуск

Нужны Docker и Docker Compose. В корне репозитория:

```sh
cp .env.example .env
# вписать DEEPSEEK_API_KEY и сгенерировать SESSION_SECRET (например: openssl rand -hex 32)
docker compose up --build -d
python3 scripts/smoke.py
```

Портал: `http://localhost:8090`. Порт опубликован только на `127.0.0.1`. Все сервисы отвечают с одного origin: портал по `/`, Planets API по `/api/…`, справочник и помощник по `/api/v1/…`, OpenAPI справочника по `/docs`. Полная карта маршрутов — [docs/API.md](docs/API.md).

При первом запуске сервис `model-fetch` скачивает и проверяет модель эмбеддингов Qwen3-Embedding-8B (около 4,7 ГБ) в игнорируемый `services/glossary-rag/data/models/` и записывает рядом метку проверки, чтобы не перечитывать файл при каждом старте. На CPU модель занимает около 5 ГБ памяти. Если есть видеокарта NVIDIA и NVIDIA Container Toolkit, эмбеддинги можно запустить на ней:

```sh
docker compose -f compose.yaml -f compose.gpu.yaml up -d
```

Справочник и поиск работают и без эмбеддингов: тогда поиск только лексический, а ответ API честно сообщает `mode: "lexical"`. Без ключа DeepSeek, с отклонённым ключом или с нулевым балансом помощник отвечает `503 assistant_unavailable` с причиной; остальной портал работает.

Каталог NASA хранится в томе `catalog-data` и обновляется при запуске и каждые 6 часов. До первой загрузки `/api/status` отдаёт `ready: false`, а маршруты каталога — `503`; портал показывает ожидание и повторяет запрос сам. `docker compose down` сохраняет том, `down -v` удаляет его — так делать не нужно.

## Проверка

```sh
docker compose config
python3 scripts/smoke.py http://localhost:8090
dotnet run --project services/planets-api/tests/Planets.Checks
cd services/glossary-rag && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m unittest discover -s tests -v
cd services/glossary-rag && .venv/bin/python -m app.audit && .venv/bin/python -m scripts.illustrations verify
cd services/portal && npm ci && npm run build && npm test
```

`smoke.py` проходит путь через gateway: портал и его маршруты, оба API, фасеты и русский поиск, OpenAPI, лимит помощника на реальном Redis. Внешний вызов DeepSeek он не делает. Если .NET SDK 10 не установлен, проверки Planets можно запустить в контейнере: `docker run --rm -v "$PWD/services/planets-api:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 dotnet run --project tests/Planets.Checks`.

## Данные вне Git

В Git есть 501 каноническая запись термина, русские версии изображений, индекс RAG, манифест иллюстраций и отчёт ревью переводов. Нет: оригиналов изображений Astro4Edu (`data/media/original/`, 321 файл, около 1,5 ГБ), модели эмбеддингов, локальной SQLite и снимков NASA/HWC. Оригиналы восстанавливаются штатным импортом с проверкой SHA-256 по записям:

```sh
docker compose run --rm --no-deps glossary-rag python -m app.importer --media-only --workers 4
```

SQLite справочника пересобирается сама, когда меняются канонические JSON.

## Структура

```text
services/portal/         фронтенд портала (Preact, TypeScript, Vite, D3), статика за nginx
services/planets-api/    .NET API кейса 3 и прежний статический PoC (wwwroot)
services/glossary-rag/   FastAPI: справочник, поиск, помощник, ревью переводов, иллюстрации
infra/gateway/           маршрутизация единого origin
docs/API.md              публичный контракт
scripts/smoke.py         интеграционная проверка через gateway
```

Правила работы и границы кейсов — в [AGENTS.md](AGENTS.md); у каждого сервиса свои `README.md` и `AGENTS.md`. Как продолжить незаконченные задачи (иллюстрации, оставшаяся часть ревью переводов) — в [HANDOFF.md](HANDOFF.md).
