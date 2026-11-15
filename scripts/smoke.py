"""Проверка реального маршрута через единый gateway, без внешнего LLM-вызова."""

import json
import sys
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8090").rstrip("/")


def get(path: str, *, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(BASE + path, data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        response = urlopen(request, timeout=150)
    except HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response), response.headers


def check(path: str, status: int, field: str, *, method: str = "GET", body: dict | None = None):
    actual, payload, _ = get(path, method=method, body=body)
    assert actual == status, f"{path}: HTTP {actual}, ожидался {status}; {payload}"
    assert field in payload, f"{path}: нет поля {field}; {payload}"
    print(f"OK {method} {path}: {actual}")
    return payload


def page(path: str, needle: str, *, label: str = "портал"):
    with urlopen(BASE + path, timeout=60) as response:
        html = response.read().decode("utf-8")
        assert response.status == 200 and "text/html" in response.headers.get("Content-Type", ""), path
    assert needle in html, f"{path}: в HTML нет «{needle}»"
    print(f"OK GET {path}: {label}")


def image(path: str):
    with urlopen(BASE + path, timeout=60) as response:
        assert response.status == 200 and response.headers.get("Content-Type", "").startswith("image/"), path
        assert response.read(16), f"{path}: пустой файл"
    print(f"OK GET {path}: изображение")


check("/health", 200, "service")
page("/", "Алкиона")
page("/planets/" + quote("Proxima Cen b"), 'id="app"')
page("/docs", "Swagger UI", label="OpenAPI")
deadline = time.monotonic() + 120
while True:
    status = check("/api/status", 200, "ready")
    if status["ready"]:
        break
    if time.monotonic() >= deadline:
        raise AssertionError("Каталог NASA не готов через 120 секунд")
    time.sleep(3)
candidate = check("/api/candidates?limit=1", 200, "items")
assert len(candidate["items"]) == 1
name = candidate["items"][0]["name"]
check("/api/candidates/" + quote(name), 200, "stability")
check("/api/candidates/" + quote(name) + "/sources", 200, "gaia")
planets = check("/api/planets", 200, "items")
assert planets["total"] == len(planets["items"]) and planets["exclusions"].get("eligible", 0) >= 1
check("/api/hwc", 200, "available")
methodology = check("/api/methodology", 200, "scoreVersion")
assert methodology["boundaries"], "нет таблицы границ зоны"
terms = check("/api/v1/terms?page_size=1", 200, "items")
assert terms["total"] > 0
assert terms["items"][0]["url"].startswith("/api/v1/terms/")
check(terms["items"][0]["url"], 200, "id")
term = check("/api/v1/terms/1", 200, "media")
assert term["media"], "у контрольного термина нет медиа"
media_id = quote(term["media"][0]["id"], safe="")
check(f"/api/v1/media/{media_id}", 200, "id")
image(f"/api/v1/media/{media_id}/file?locale=ru")
image("/api/v1/terms/1/illustration")
facets = check("/api/v1/terms/facets?locale=ru", 200, "letters")
assert facets["total"] == terms["total"]
check("/api/v1/articles", 200, "items")
check("/api/v1/articles/smoke-unknown-id", 404, "code")
search = check("/api/v1/search?q=star&locale=en", 200, "items")
assert search["total"] > 0 and search["mode"] in ("hybrid", "lexical")
russian = check("/api/v1/search?q=" + quote("черные дыры") + "&locale=ru", 200, "items")
assert russian["items"] and "дыр" in russian["items"][0]["title"].lower(), russian["items"][:1]
schema = check("/openapi.json", 200, "paths")
assert "/api/v1/assistant/answer" in schema["paths"]
check("/api/v1/route-does-not-exist", 404, "code")

# Лимит помощника: один принятый запрос за 10 с; ранний повтор получает остаток интервала без нового штрафа.
for _ in range(2):
    assistant_status, assistant_error, _ = get("/api/v1/assistant/answer", method="POST", body={})
    if assistant_status != 429:
        break
    time.sleep(11)
assert assistant_status == 422 and assistant_error["code"] == "validation_error", (assistant_status, assistant_error)
print("OK POST /api/v1/assistant/answer: 422")
early, payload, headers = get("/api/v1/assistant/answer", method="POST", body={})
retry = int(headers.get("Retry-After", "0"))
assert early == 429 and 1 <= retry <= 10, (early, payload, headers)
time.sleep(retry + 0.5)
later, payload, _ = get("/api/v1/assistant/answer", method="POST", body={})
assert later == 422, f"после Retry-After запрос должен пройти, получено {later}: {payload}"
print(f"OK лимит помощника: повтор через {retry} с принят")
print("Портал и оба API доступны через один origin.")
