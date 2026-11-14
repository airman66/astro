"""Rebuildable SQLite catalogue and bilingual FTS5 index."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
from pathlib import Path

DATA = Path(os.getenv("DATA_DIR", "data"))
DB = DATA / "glossary.db"
_lock = threading.Lock()


def connection() -> sqlite3.Connection:
    ensure_database()
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db


def ensure_database() -> None:
    if DB.exists():
        return
    with _lock:
        if DB.exists():
            return
        rebuild_database()


def rebuild_database() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    temporary = DB.with_suffix(".building")
    if temporary.exists():
        temporary.unlink()
    db = sqlite3.connect(temporary)
    try:
        db.executescript(
            """
            CREATE TABLE terms (number INTEGER PRIMARY KEY, title_en TEXT NOT NULL,
                title_ru TEXT NOT NULL, categories TEXT NOT NULL,
                review_status TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE articles (id TEXT PRIMARY KEY, title_en TEXT NOT NULL,
                title_ru TEXT NOT NULL, review_status TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE media (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE VIRTUAL TABLE search_fts USING fts5(
                record_id UNINDEXED, section_id UNINDEXED, locale UNINDEXED,
                kind UNINDEXED, title, body, url UNINDEXED, review_status UNINDEXED,
                tokenize='unicode61 remove_diacritics 2');
            """
        )
        seen_media: set[str] = set()
        for path in sorted((DATA / "processed" / "terms").glob("*.json")):
            record = json.loads(path.read_text(encoding="utf-8"))
            number = int(record["source"]["term_number"])
            en, ru = record["locales"]["en"], record["locales"]["ru"]
            status = record["review"]["status"]
            db.execute(
                "INSERT INTO terms VALUES (?,?,?,?,?,?)",
                (number, en["title"], ru["title"], json.dumps(record["metadata"].get("categories", [])), status, json.dumps(record, ensure_ascii=False)),
            )
            url = f"/api/v1/terms/{number}"
            for locale, loc in (("en", en), ("ru", ru)):
                aliases = ", ".join(loc.get("aliases", []))
                db.execute(
                    "INSERT INTO search_fts VALUES (?,?,?,?,?,?,?,?)",
                    (record["id"], "title", locale, "term", loc["title"], aliases, url, status),
                )
                for section in record["sections"]:
                    block = loc.get("blocks", {}).get(section["id"], {})
                    if block.get("body"):
                        db.execute(
                            "INSERT INTO search_fts VALUES (?,?,?,?,?,?,?,?)",
                            (record["id"], section["id"], locale, "term", loc["title"], block["body"], url, status),
                        )
            for item in record.get("media", []):
                if item["id"] in seen_media:
                    continue
                seen_media.add(item["id"])
                db.execute("INSERT INTO media VALUES (?,?)", (item["id"], json.dumps(item, ensure_ascii=False)))
                for locale in ("en", "ru"):
                    title = item.get(f"title_{locale}") or ""
                    body = " ".join(filter(None, [item.get(f"short_caption_{locale}"), item.get(f"caption_{locale}"), item.get(f"alt_{locale}")]))
                    if title or body:
                        db.execute(
                            "INSERT INTO search_fts VALUES (?,?,?,?,?,?,?,?)",
                            (record["id"], item["id"], locale, item["kind"], title, body, f"/api/v1/media/{item['id']}", item["review"]["status"]),
                        )
        for path in sorted((DATA / "processed" / "articles").glob("*.json")):
            record = json.loads(path.read_text(encoding="utf-8"))
            en, ru = record["locales"]["en"], record["locales"]["ru"]
            status = record["review"]["status"]
            db.execute("INSERT INTO articles VALUES (?,?,?,?,?)", (record["id"], en["title"], ru["title"], status, json.dumps(record, ensure_ascii=False)))
            url = f"/api/v1/articles/{record['id']}"
            for locale, loc in (("en", en), ("ru", ru)):
                for section in record["sections"]:
                    block = loc["blocks"].get(section["id"], {})
                    db.execute("INSERT INTO search_fts VALUES (?,?,?,?,?,?,?,?)", (record["id"], section["id"], locale, "article", loc["title"], block.get("body", ""), url, status))
        db.commit()
    finally:
        db.close()
    temporary.replace(DB)


def get_term(number: int) -> dict | None:
    with connection() as db:
        row = db.execute("SELECT payload FROM terms WHERE number=?", (number,)).fetchone()
    return json.loads(row[0]) if row else None


def get_article(identifier: str) -> dict | None:
    with connection() as db:
        row = db.execute("SELECT payload FROM articles WHERE id=?", (identifier,)).fetchone()
    return json.loads(row[0]) if row else None


def get_media(identifier: str) -> dict | None:
    with connection() as db:
        row = db.execute("SELECT payload FROM media WHERE id=?", (identifier,)).fetchone()
    return json.loads(row[0]) if row else None


def list_records(kind: str, *, page: int, page_size: int, locale: str, query: str = "", category: str = "", letter: str = "", status: str = "") -> tuple[list[dict], int]:
    table = "terms" if kind == "term" else "articles"
    clauses, args = [], []
    if query:
        clauses.append("(title_en LIKE ? OR title_ru LIKE ?)")
        args.extend([f"%{query}%", f"%{query}%"])
    if category and table == "terms":
        clauses.append("categories LIKE ?")
        args.append(f'%"{category}"%')
    if letter:
        clauses.append("(title_en LIKE ? OR title_ru LIKE ?)")
        args.extend([f"{letter}%", f"{letter}%"])
    if status:
        clauses.append("review_status=?")
        args.append(status)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with connection() as db:
        total = db.execute(f"SELECT COUNT(*) FROM {table}{where}", args).fetchone()[0]
        rows = db.execute(f"SELECT * FROM {table}{where} ORDER BY title_en COLLATE NOCASE LIMIT ? OFFSET ?", [*args, page_size, (page - 1) * page_size]).fetchall()
    result = []
    for row in rows:
        payload = json.loads(row["payload"])
        title = row[f"title_{locale}"] or row["title_en"]
        result.append({"id": payload["id"], "title": title, "url": f"/api/v1/{table}/{row['number'] if table == 'terms' else row['id']}", "review_status": row["review_status"], "categories": payload.get("metadata", {}).get("categories", [])})
    return result, total


def search(query: str, locale: str, limit: int = 20) -> list[dict]:
    tokens = re.findall(r"[^\W_]+", query.casefold(), re.UNICODE)[:12]
    if not tokens:
        return []
    expression = " OR ".join('"' + token.replace('"', '') + '"*' for token in tokens)
    with connection() as db:
        rows = db.execute(
            "SELECT record_id,section_id,locale,kind,title,body,url,review_status,bm25(search_fts, 0,0,0,0,8,1) AS score FROM search_fts WHERE search_fts MATCH ? AND locale=? ORDER BY score LIMIT ?",
            (expression, locale, limit),
        ).fetchall()
    lexical = [{"record_id": row["record_id"], "section_id": row["section_id"], "kind": row["kind"], "title": row["title"], "excerpt": row["body"][:400], "url": row["url"], "review_status": row["review_status"], "score": -row["score"]} for row in rows]
    from app import vector

    semantic = vector.search(query, locale, limit)
    if not semantic:
        return lexical
    fused: dict[tuple[str, str], dict] = {}
    for ranked in (lexical, semantic):
        for rank, item in enumerate(ranked):
            key = item["record_id"], item["section_id"]
            if key not in fused:
                fused[key] = {**item, "score": 0.0}
            fused[key]["score"] += 1.0 / (60 + rank + 1)
    return sorted(fused.values(), key=lambda row: row["score"], reverse=True)[:limit]


if __name__ == "__main__":
    rebuild_database()
