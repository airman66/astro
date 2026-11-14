# TulaHack 2026 — правила монорепозитория

## Продукт

Один астрономический портал с одним будущим фронтендом. **Кейс 3 — основной:** дашборд по данным NASA об экзопланетах, каталог кандидатов, методика отбора и ИИ-помощник. **Кейс 2 — дополнительный:** раздел интерактивных задач и 3D-экспериментов. Новые учебные интерактивы добавляются в этот раздел, не как отдельные сайты. Единый фронтенд портала — `services/portal/`.

## Состав

- `services/portal/` — единый фронтенд портала (Preact, TypeScript, Vite, D3), статика за nginx. Его правила — `services/portal/AGENTS.md`.
- `services/planets-api/` — .NET 10 API основного кейса, NASA/HWC/дополнительные источники; прежний статический PoC в `wwwroot` сохранён как исходная реализация и доступен только на внутреннем порту сервиса. Его правила — `services/planets-api/AGENTS.md`.
- `services/glossary-rag/` — FastAPI справочник, поиск и DeepSeek-помощник. Его правила — `services/glossary-rag/AGENTS.md`, схема данных — `SPEC.md` там же.
- `infra/gateway/default.conf` — единственный публичный вход. `/api/v1/*` идёт в RAG, остальные `/api/*` — в Planets API. `/docs`, `/openapi.json`, `/health` обслуживает RAG; `/` и пути приложения — сервис `portal`. Имена сервисов gateway перерезолвит через DNS Docker, поэтому пересоздание одного контейнера не требует перезапуска gateway.
- `compose.yaml` — полный локальный стек: gateway, портал, оба API, Redis, модель эмбеддингов (необязательная зависимость RAG); `compose.gpu.yaml` — эмбеддинги на NVIDIA GPU. Ключ DeepSeek берётся только из окружения.

## API и новые сервисы

Фронтенд обращается к относительным URL того же origin: `GET /api/candidates`, `GET /api/status`, `GET /api/v1/terms`, `GET /api/v1/search`, `POST /api/v1/assistant/answer`. Полная карта — `docs/API.md`. Не менять существующие пути, форму ответов и ссылки RAG без явного обновления контракта и проверки клиентов. Для следующего сервиса сначала выделить собственный префикс в gateway и записать его в `docs/API.md`; порядок location не должен отправлять его в Planets API.

Сохранять границу данных: балл пригодности — эвристика из NASA, не вероятность жизни; RAG отвечает с указанием реально найденных источников. Кейс 2 не должен менять научный рейтинг кейса 3.

## Работа и проверка

Из корня: `docker compose config`, `docker compose up --build -d`, `python3 scripts/smoke.py`. Проверка .NET: `dotnet run --project services/planets-api/tests/Planets.Checks`. Проверка RAG: `cd services/glossary-rag && .venv/bin/python -m unittest discover -s tests -v`, целостность — `python -m app.audit` и `python -m scripts.illustrations verify`. Проверка портала: `cd services/portal && npm ci && npm run build && npm test`. После изменения маршрутов проверять доступ через gateway и напрямую внутри сервиса.

Не коммитить `.env`, ключи, локальные модели, исходные медиа и снимки NASA. Окончания строк фиксирует `.gitattributes` (LF): скрипты и конфиги исполняются в Linux-контейнерах, CRLF из Windows-клона их ломает. Не удалять канонические записи, индекс RAG и исходные файлы при перестройке Compose. Корневой Git хранит историю бывшего `glossary-rag`; вложенный `.git` не создавать.
