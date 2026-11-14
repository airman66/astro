# Единый API для будущего фронтенда

Базовый адрес при локальном запуске: `http://localhost:8090`. Из браузера использовать относительные пути: оба сервиса доступны с одного origin и не требуют CORS между собой.

| Метод и путь | Владелец | Назначение |
| --- | --- | --- |
| `GET /api/status` | Planets | Готовность каталога NASA; `ready` может быть `false` до первой загрузки |
| `GET /api/candidates?limit=50&zone=all` | Planets | Рейтинг кандидатов |
| `GET /api/candidates/{name}` | Planets | Карточка планеты; кодировать имя в URL |
| `GET /api/candidates/{name}/sources` | Planets | Gaia, TESS и спектры |
| `GET /api/hwc` | Planets | Сравнение с HWC |
| `GET /api/methodology` | Planets | Методика отбора и балла |
| `GET /api/v1/terms` | RAG | Справочник терминов |
| `GET /api/v1/terms/{number}` | RAG | Термин с локализациями и медиа |
| `GET /api/v1/articles` | RAG | Статьи |
| `GET /api/v1/search?q=...` | RAG | Поиск |
| `GET /api/v1/media/{id}` | RAG | Метаданные медиа |
| `GET /api/v1/media/{id}/file?locale=ru` | RAG | Локализованный файл |
| `POST /api/v1/assistant/answer` | RAG | ИИ-помощник |

Пример запроса к помощнику:

```http
POST /api/v1/assistant/answer
Content-Type: application/json

{"question":"Что такое экзопланета?","mode":"auto","locale":"ru"}
```

Ответ содержит `mode`, `grounding`, `answer`, `primary_url`, `sources`, `review_status`, `diagnostics`. Без `DEEPSEEK_API_KEY` помощник отвечает `503` с `code: assistant_unavailable`, а справочник продолжает работать. RAG ограничивает запросы к помощнику: один запрос от клиента за 10 секунд; ответ `429` содержит `Retry-After`. Формы остальных ответов определены в `services/glossary-rag/SPEC.md` и `services/planets-api/README.md`.

Служебные маршруты gateway: `GET /health` — liveness RAG, `GET /docs` и `GET /openapi.json` — его OpenAPI. `GET /` пока отдаёт существующий интерфейс Planets. Gateway сохраняет исходные API пути; поэтому ссылки `/api/v1/...` внутри ответов RAG работают на том же адресе. Новые сервисы получают отдельный префикс до общего маршрута `/api/`.
