# TulaHack 2026 — правила монорепозитория

## Продукт

Один астрономический портал с одним будущим фронтендом. **Кейс 3 — основной:** дашборд по данным NASA об экзопланетах, каталог кандидатов, методика отбора и ИИ-помощник. **Кейс 2 — дополнительный:** раздел интерактивных задач и 3D-экспериментов. Новые учебные интерактивы добавляются в этот раздел, не как отдельные сайты. Единый фронтенд портала — `services/portal/`.

## Состав

- `services/portal/` — единый фронтенд портала (Preact, TypeScript, Vite, D3), статика за nginx. Его правила — `services/portal/AGENTS.md`.
- `services/planets-api/` — архив исходной .NET-реализации и статического PoC. В рабочий стек не входит; справочный код и тесты сохранены для проверки переноса.
- `services/glossary-rag/` — общий FastAPI: `app/planets/` (NASA, рейтинг, устойчивость, HWC, архивы), справочник, поиск и ИИ-помощник. Его правила — `services/glossary-rag/AGENTS.md`, схема данных — `SPEC.md` там же.
- `infra/gateway/default.conf` — конфигурация единственного публичного nginx (`web`): статика портала и SPA, `/api/*`, `/docs`, `/openapi.json`, `/health` проксируются в `api`; `/webhooks/max` — в необязательный MAX bot. DNS Docker перерезолвится без перезапуска web.
- `compose.yaml` — три основных контейнера: web, api, redis. Эмбеддинги и загрузчик модели включаются профилем `embeddings`, боты — `telegram`/`max`; `compose.gpu.yaml` — GPU-оверлей для профиля embeddings. Ключи LLM — только из окружения.

## API и новые сервисы

Фронтенд обращается к относительным URL того же origin: `GET /api/candidates`, `GET /api/status`, `GET /api/v1/terms`, `GET /api/v1/search`, `POST /api/v1/assistant/answer`. Полная карта — `docs/API.md`. Не менять существующие пути, форму ответов и ссылки RAG без явного обновления контракта и проверки клиентов. Новый модуль добавлять роутером в общий FastAPI с собственным префиксом и записью в `docs/API.md`.

Сохранять границу данных: балл пригодности — эвристика из NASA, не вероятность жизни; RAG отвечает с указанием реально найденных источников. Кейс 2 не должен менять научный рейтинг кейса 3.

## Работа и проверка

Из корня: `docker compose config`, `docker compose up --build -d`, `python3 scripts/smoke.py --skip-assistant`. Проверка общего API (включая перенос Planets): `cd services/glossary-rag && .venv/bin/python -m unittest discover -s tests -v`, целостность — `python -m app.audit` и `python -m scripts.illustrations verify`. Проверка портала: `cd services/portal && npm ci && npm run build && npm test`. После изменения маршрутов проверять доступ через gateway и напрямую внутри сервиса.

Не коммитить `.env`, ключи, локальные модели, исходные медиа и снимки NASA. Окончания строк фиксирует `.gitattributes` (LF): скрипты и конфиги исполняются в Linux-контейнерах, CRLF из Windows-клона их ломает. Не удалять канонические записи, индекс RAG и исходные файлы при перестройке Compose. Корневой Git хранит историю бывшего `glossary-rag`; вложенный `.git` не создавать.
