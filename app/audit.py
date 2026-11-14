"""Validate source IDs, translation coverage, links, and local image hashes."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

from app.storage import DATA


def check() -> dict:
    files = sorted((DATA / "processed" / "terms").glob("*.json"))
    records = [json.loads(path.read_text()) for path in files]
    ids = {record["source"]["term_number"] for record in records}
    errors: list[str] = []
    media: dict[str, dict] = {}
    for record in records:
        number = record["source"]["term_number"]
        if record["id"] != f"term:{number}" or str(number) not in Path(record["source"]["url"]).name:
            # Source URLs end in a slash; URL term number is checked below.
            if record["id"] != f"term:{number}" or not record["source"]["url"].rstrip("/").endswith(f"/{number}"):
                errors.append(f"term {number}: source ID mismatch")
        if set(record["locales"]["en"]["blocks"]) != set(record["locales"]["ru"]["blocks"]):
            errors.append(f"term {number}: block ID mismatch")
        for linked in record["metadata"].get("related_term_numbers", []):
            if linked not in ids:
                errors.append(f"term {number}: broken related term {linked}")
        for locale in ("en", "ru"):
            if not record["locales"][locale]["title"].strip():
                errors.append(f"term {number}: empty {locale} title")
        en, ru = record["locales"]["en"], record["locales"]["ru"]
        if len(en.get("aliases", [])) != len(ru.get("aliases", [])):
            errors.append(f"term {number}: aliases untranslated")
        if len(record["metadata"].get("categories", [])) != len(record["metadata"].get("categories_ru", [])):
            errors.append(f"term {number}: categories untranslated")
        for block_id, block in en["blocks"].items():
            for field in ("heading", "body"):
                if block.get(field) and not ru["blocks"].get(block_id, {}).get(field):
                    errors.append(f"term {number}: untranslated {block_id}/{field}")
        for section in record["sections"]:
            for identifier in section["media_ids"]:
                if identifier not in {item["id"] for item in record["media"]}:
                    errors.append(f"term {number}: broken media {identifier}")
            for field in ("heading", "body"):
                if section.get(field) and not section.get(field + "_ru"):
                    errors.append(f"term {number}: untranslated section {section['id']}/{field}")
            for link in section["links"]:
                if link.get("text") and not link.get("text_ru"):
                    errors.append(f"term {number}: untranslated link {link['url']}")
        for item in record["media"]:
            old = media.setdefault(item["id"], item)
            for field in ("title_ru", "caption_ru", "short_caption_ru", "alt_ru"):
                if old.get(field) and item.get(field) and old[field] != item[field]:
                    errors.append(f"media {item['id']}: inconsistent {field}")
            for field in ("title", "short_caption", "caption", "alt"):
                if item.get(field + "_en") and not item.get(field + "_ru"):
                    errors.append(f"media {item['id']}: untranslated {field}")
    for identifier, item in media.items():
        if item.get("original_path"):
            path = Path(item.get("original_path") or "")
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item.get("sha256"):
                errors.append(f"media {identifier}: missing/changed original image")
        if item.get("ru_path"):
            path = Path(item["ru_path"])
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item.get("ru_sha256"):
                errors.append(f"media {identifier}: missing/changed RU image")
    return {"records": len(records), "unique_ids": len(ids), "unique_media": len(media), "image_files": sum(bool(item.get("original_path")) for item in media.values()), "translated_titles": sum(bool(record["locales"]["ru"]["title"]) for record in records), "errors": errors, "error_counts": dict(Counter(error.split(":")[-1].strip() for error in errors))}


if __name__ == "__main__":
    report = check()
    print(json.dumps({key: value for key, value in report.items() if key != "errors"}, ensure_ascii=False, indent=2))
    if report["errors"]:
        print("first errors:", *report["errors"][:30], sep="\n")
        raise SystemExit(1)
