"""Проверка реального маршрута через единый gateway, без внешнего LLM-вызова."""

import json
import sys
import time
from urllib.error import HTTPError
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
        return response.status, json.load(response)


def check(path: str, status: int, field: str, *, method: str = "GET", body: dict | None = None):
    actual, payload = get(path, method=method, body=body)
    assert actual == status, f"{path}: HTTP {actual}, ожидался {status}; {payload}"
    assert field in payload, f"{path}: нет поля {field}; {payload}"
    print(f"OK {method} {path}: {actual}")
    return payload


check("/health", 200, "service")
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
check("/api/methodology", 200, "scoreVersion")
terms = check("/api/v1/terms?page_size=1", 200, "items")
assert terms["total"] > 0
assert terms["items"][0]["url"].startswith("/api/v1/terms/")
check(terms["items"][0]["url"], 200, "id")
search = check("/api/v1/search?q=star&locale=en", 200, "items")
assert search["total"] > 0
schema = check("/openapi.json", 200, "paths")
assert "/api/v1/assistant/answer" in schema["paths"]
check("/api/v1/route-does-not-exist", 404, "code")
for _ in range(2):
    assistant_status, assistant_error = get("/api/v1/assistant/answer", method="POST", body={})
    if assistant_status != 429:
        break
    time.sleep(11)
assert assistant_status == 422 and assistant_error["code"] == "validation_error", (
    assistant_status,
    assistant_error,
)
print("OK POST /api/v1/assistant/answer: 422")
print("Оба API доступны через один origin.")
