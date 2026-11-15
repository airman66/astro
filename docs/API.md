# Единый API портала

Базовый адрес при локальном запуске: `http://localhost:8090`. Фронтенд портала отдаётся по `/` и обращается к API относительными путями того же origin, поэтому CORS между сервисами не нужен.

| Метод и путь | Владелец | Назначение |
| --- | --- | --- |
| `GET /` и пути приложения (`/planets/…`, `/glossary/…`, `/experiments/…`) | Portal | Единый фронтенд портала |
| `GET /api/status` | Planets | Готовность каталога NASA и состояние обновления |
| `GET /api/candidates?limit=50&zone=all` | Planets | Рейтинг кандидатов, `limit` 1–1000 |
| `GET /api/candidates/{name}` | Planets | Карточка кандидата; имя кодировать в URL |
| `GET /api/candidates/{name}/sources` | Planets | Gaia, TESS и спектры |
| `GET /api/planets` | Planets | Все подтверждённые планеты в компактном виде и итог отбора каждой |
| `GET /api/hwc` | Planets | Сравнение с HWC |
| `GET /api/methodology` | Planets | Методика, веса, пороги, таблица границ зоны, история версий |
| `GET /api/v1/terms` | RAG | Справочник терминов |
| `GET /api/v1/terms/facets?locale=ru` | RAG | Буквы алфавитного указателя и категории с числом терминов |
| `GET /api/v1/terms/{number}` | RAG | Термин с локализациями, медиа и иллюстрацией |
| `GET /api/v1/terms/{number}/illustration` | RAG | Локальный файл обложки термина |
| `GET /api/v1/articles` | RAG | Статьи |
| `GET /api/v1/articles/{article_id}` | RAG | Статья по ID; неизвестный ID возвращает `404` |
| `GET /api/v1/search?q=...` | RAG | Поиск |
| `GET /api/v1/media/{id}` | RAG | Метаданные медиа |
| `GET /api/v1/media/{id}/file?locale=ru` | RAG | Локализованный файл |
| `POST /api/v1/assistant/answer` | RAG | ИИ-помощник |
| `POST /webhooks/max` | MAX bot | Приём событий MAX с заголовком `X-Max-Bot-Api-Secret` |

Служебные маршруты gateway: `GET /health` — liveness RAG, `GET /docs` и `GET /openapi.json` — OpenAPI RAG. Gateway сохраняет исходные пути, поэтому ссылки `/api/v1/...` в ответах RAG работают на том же адресе. Имена сервисов перерезолвятся через DNS Docker каждые 10 секунд: пересоздание одного контейнера не ломает маршрутизацию. Новые сервисы получают свой префикс до общего `/api/`. Прежний статический PoC остаётся в `services/planets-api/Planets.Api/wwwroot` и доступен только на внутреннем порту Planets API.

## Planets API

**Состояния каталога.** До первой загрузки NASA `GET /api/status` отвечает `ready: false`, а `/api/candidates`, `/api/candidates/{name}`, `/api/planets` — `503` (ProblemDetails `Catalog has not loaded yet`). Пока снимка нет, повтор идёт через 1, 2, 4 … до 30 минут, а не через 6 часов. Если обновление не удалось при уже загруженном снимке, сервис продолжает отдавать снимок и пробует снова через 30 минут. Таймаут NASA или HWC считается недоступностью источника и не останавливает сервис.

`GET /api/status`:

```json
{"ready": true, "fetchedAt": "2026-11-14T14:48:13Z", "totalPlanets": 6470, "candidateCount": 67,
 "source": "NASA Exoplanet Archive / pscomppars", "scoreVersion": "1.1", "fromCache": false,
 "lastAttemptAt": "2026-11-14T14:48:07Z", "refreshError": null, "nextAttemptAt": "2026-11-14T20:48:14Z",
 "refreshIntervalHours": 6}
```

`fromCache: true` — снимок прочитан с диска и с момента запуска ещё не обновлялся. `refreshError` — краткая причина последней неудачи (`timeout`, `http 503`).

`GET /api/candidates` возвращает `fetchedAt`, `scoreVersion`, `total` (все кандидаты) и `items`. Кандидат содержит прежние поля (балл и его компоненты, параметры, границы зоны, `dataFlags`, `stability`) и новые: `rank` — место в рейтинге, `discoveryYear`, `discoveryMethod`, `systemPlanetCount`. Неизвестный кандидат — `404` ProblemDetails.

`GET /api/planets` — каждая подтверждённая планета снимка:

```json
{"fetchedAt": "…", "scoreVersion": "1.1", "total": 6470,
 "exclusions": {"eligible": 67, "controversial": 58, "circumbinary": 44, "starTemperatureUnknown": 300,
   "starTemperatureOutOfRange": 65, "fluxUnknown": 268, "outsideHabitableZone": 5473, "sizeUnknown": 4, "radiusOutOfRange": 191},
 "items": [{"name": "Proxima Cen b", "hostName": "Proxima Cen", "radiusEarth": 1.02, "radiusCalculated": true,
   "massEarth": 1.055, "massMayBeMinimum": true, "fluxEarth": 0.641, "fluxProvenance": "published",
   "stellarTemperatureK": 2900, "distanceParsec": 1.30119, "rightAscensionDegrees": 217.39, "declinationDegrees": -62.68,
   "discoveryYear": 2016, "discoveryMethod": "Radial Velocity", "habitableZone": "conservative",
   "eligible": true, "exclusion": null, "score": 99.2}]}
```

Числа в примере — снимок NASA от 14 ноября 2026 года. `habitableZone` — `conservative`, `optimistic`, `outside` или `null`, если поток или температура звезды неизвестны. `exclusion` — первый непройденный этап отбора в порядке `controversial`, `circumbinary`, `starTemperatureUnknown`, `starTemperatureOutOfRange`, `fluxUnknown`, `outsideHabitableZone`, `sizeUnknown`, `radiusOutOfRange`, `massOutOfRange`. Значения, которые NASA даёт только как предел, в ответе равны `null`.

`GET /api/methodology` к прежним текстовым полям добавляет `weights`, `thresholds`, `stabilitySamples`, `boundaries` (границы Kopparapu 2014 через каждые 100 K, поток в долях земного) и `versions`. Версия методики **1.1**: веса и границы те же, что в 1, но значения-пределы NASA (`st_tefflim`, `st_lumlim`, `pl_orbsmaxlim`) больше не используются как измерения.

## Glossary RAG

Ошибки RAG: `{"code", "message", "details"}`. Списки: `items`, `total`, `page`, `page_size`. Элемент списка терминов: `id`, `title` (на языке `locale`), `title_en`, `url`, `review_status`, `categories`, `categories_ru`, `illustration_url` (или `null`). Поиск по названию (`q`) и фильтр по букве (`letter`) не зависят от регистра и `ё`; сортировка — по названию на языке `locale`.

`GET /api/v1/search` ищет по нормализованному тексту (регистр, `ё → е`) и основам слов (Snowball для русского и английского), служебные слова вроде «что такое» отбрасываются. При работающем сервере эмбеддингов результаты объединяются с семантическим поиском (`mode: "hybrid"`), иначе выдача только лексическая (`mode: "lexical"`), а не ошибка 500. `total` — размер пула релевантных результатов, не больше 200.

`GET /api/v1/terms/{number}` дополнительно содержит `illustration`: `null` или `{term_number, url, width, height, alt_ru, alt_en, caption_ru, kind, status, generator, source_type, file_page, article_url, author, license, license_url, modified}`. Файл отдаёт `GET /api/v1/terms/{number}/illustration`; пока обложка не готова — `404 illustration_not_found`.

Помощник:

```http
POST /api/v1/assistant/answer
Content-Type: application/json

{"question":"Что такое экзопланета?","mode":"auto","locale":"ru","context":{"planet":"Proxima Cen b"}}
```

Ответ: `mode`, `grounding`, `answer`, `primary_url`, `sources`, `images`, `review_status`, `diagnostics`. `images[]` содержит до трёх изображений из реально использованных материалов: `record_id`, `url`, `alt`, `caption`, `kind` (`illustration` или `source_media`), для Wikimedia и исходных медиа также `credit`, `credit_url`, `license`, `license_url`, `modified`. При общем ответе без источников массив пуст. Ссылки указывают только на реально найденные записи. Ошибки помощника:

| Код | Когда |
| --- | --- |
| `503 assistant_unavailable` | нет ключа выбранного LLM-провайдера, ключ отклонён или закончился баланс; `message` называет причину |
| `429 rate_limited` + `Retry-After` | один принятый запрос от клиента за 10 секунд; ранний повтор получает остаток интервала, новое ожидание не начинается |
| `503 assistant_overloaded` + `Retry-After: 10` | заняты все слоты одновременных вызовов LLM |
| `502 assistant_error` | LLM вернула ошибку или ответ неверной формы |
| `504 assistant_timeout` | ответ не уложился в 100 секунд |

Для чтения и поиска — 30 запросов за 10 секунд, для файлов — 120. Если Redis недоступен, чтение справочника и файлы продолжают работать без общих счётчиков, а помощник закрыт (`503 rate_limit_unavailable`). Справочник и поиск не зависят от ключа LLM и от сервера эмбеддингов.

Провайдер задаётся серверной переменной `ASSISTANT_PROVIDER=runpod|deepseek`. Для публичного GLM-5.3 RunPod используются `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID=b1dd8hy2hqo1nb`, `RUNPOD_MODEL=glm-5.3`. Запрос идёт с `temperature=1.0`, `top_p=0.95`, `reasoning_effort=low`, `response_format=json_object`. Ключ не попадает во фронтенд.
