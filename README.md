# TulaHack 2026 — астрономический портал

Монорепозиторий двух независимых API с единым адресом для будущего фронтенда. Основной продукт (кейс 3) — дашборд NASA по экзопланетам и ИИ-помощник. Дополнительный раздел (кейс 2) — интерактивные задачи и 3D-эксперименты. Сейчас объединены бэкенды; существующий интерфейс Planets оставлен как PoC, новый общий фронтенд не добавлен.

## Запуск

Нужны Docker и Docker Compose. В корне репозитория:

```sh
cp .env.example .env
# при необходимости вписать DEEPSEEK_API_KEY в .env
docker compose up --build -d
python3 scripts/smoke.py
```

Единый адрес: `http://localhost:8090`. Основной API — `/api/status`, `/api/candidates`, `/api/hwc`, `/api/methodology`; справочник и помощник — `/api/v1/terms`, `/api/v1/search`, `/api/v1/assistant/answer`. Контракт и примеры: [docs/API.md](docs/API.md). `GET /docs` показывает OpenAPI RAG. Порт 8090 опубликован только на `127.0.0.1`; между контейнерами сервисы доступны по именам Compose.

Первый запуск модели эмбеддингов скачивает и проверяет файл около 4,7 ГБ в игнорируемый `services/glossary-rag/data/models/`. Уже подготовленные данные и модель в каталоге RAG сохраняются при переносе. Каталог NASA хранится в Docker томе `catalog-data`, обновляется из NASA при запуске; до первой загрузки `/api/status` отдаёт `ready: false`, а `/api/candidates` — `503`. `docker compose down` останавливает стек и сохраняет том; `down -v` удаляет том каталога.

## Проверка

```sh
docker compose config
python3 scripts/smoke.py http://localhost:8090
dotnet run --project services/planets-api/tests/Planets.Checks
cd services/glossary-rag && .venv/bin/python -m unittest discover -s tests -v
```

`smoke.py` проверяет маршрутизацию через gateway, ответы обоих сервисов и OpenAPI. Внешний вызов DeepSeek он не выполняет. Для работы помощника нужен ключ в корневом `.env`; без него чтение справочника работает, а помощник даёт явную ошибку `503`.

## Структура

```text
services/planets-api/    .NET API основного кейса и прежний статический PoC
services/glossary-rag/   FastAPI, данные, поиск и ИИ-помощник
infra/gateway/           маршрутизация единого origin
docs/API.md              карта публичных маршрутов
scripts/smoke.py         интеграционная проверка
```

Правила работы и границы кейсов — в [AGENTS.md](AGENTS.md). В каждой службе остались её собственные `README.md` и `AGENTS.md`.
