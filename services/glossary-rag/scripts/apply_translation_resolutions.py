"""Apply checked QA corrections to the cache and matching draft record fields."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.translate import ROOT
from scripts.review_translations import digest

CACHE = ROOT / "data/processed/.translation-cache.json"
RESOLUTIONS = ROOT / "data/eval/translation_resolutions.json"
DECISIONS = ROOT / "data/eval/translation_applied.json"
TERMS = ROOT / "data/processed/terms"
NUMBERS = re.compile(r"(?<!\d)\d+(?:[.,]\d+)*(?!\d)")
EAST_ASIAN = re.compile(r"[一-龯ぁ-んァ-ン가-힣]")


def numeric_sequence(value: str) -> list[str]:
    return [match.replace(",", ".") for match in NUMBERS.findall(value)]


def pairs(record: dict[str, Any]):
    en, ru = record["locales"]["en"], record["locales"]["ru"]
    yield en.get("title"), ru, "title"
    for index, source in enumerate(en.get("aliases", [])):
        yield source, ru["aliases"], index
    for block_id, block in en["blocks"].items():
        for field in ("heading", "body"):
            yield block.get(field), ru["blocks"][block_id], field
    for section in record["sections"]:
        for field in ("heading", "body"):
            yield section.get(field), section, field + "_ru"
        for link in section["links"]:
            yield link.get("text"), link, "text_ru"
    for media in record["media"]:
        if media.get("review", {}).get("status") == "reviewed":
            continue
        for field in ("title", "short_caption", "caption", "alt"):
            yield media.get(field + "_en"), media, field + "_ru"
    for index, source in enumerate(record["metadata"].get("categories", [])):
        yield source, record["metadata"]["categories_ru"], index


def main() -> None:
    cache = json.loads(CACHE.read_text())
    resolutions = json.loads(RESOLUTIONS.read_text())["results"]
    selected: dict[str, tuple[str, str]] = {}
    rejected: list[dict] = []
    for source, current in cache.items():
        identifier = digest(source, current)
        result = resolutions.get(identifier)
        if not result or not result["valid"] or result["corrected_ru"] == current:
            continue
        proposal = result["corrected_ru"]
        reason = None
        if not proposal.strip():
            reason = "empty"
        elif len(proposal) < 0.5 * len(current):
            reason = "truncated"
        elif len(proposal) > 2.0 * len(current) and not EAST_ASIAN.search(source):
            reason = "inflated"
        elif numeric_sequence(source) != numeric_sequence(proposal):
            reason = "numbers_changed"
        elif len(source) > 800 and abs(len(proposal) - len(current)) > max(400, 0.35 * len(current)):
            reason = "large_rewrite"
        if reason:
            rejected.append({"id": identifier, "reason": reason, "source": source, "current_ru": current, "proposed_ru": proposal})
        else:
            selected[source] = (current, proposal)
    touched = 0
    fields = 0
    for path in sorted(TERMS.glob("*.json")):
        record = json.loads(path.read_text())
        if record.get("review", {}).get("status") == "reviewed":
            continue
        changed = False
        for source, container, field in pairs(record):
            correction = selected.get(source)
            if correction and container[field] == correction[0]:
                container[field] = correction[1]
                fields += 1
                changed = True
        if changed:
            temp = path.with_suffix(".json.tmp")
            temp.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
            temp.replace(path)
            touched += 1
    for source, (_, proposal) in selected.items():
        cache[source] = proposal
    temp = CACHE.with_suffix(".json.tmp")
    temp.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n")
    temp.replace(CACHE)
    DECISIONS.write_text(json.dumps({"applied_unique": len(selected), "applied_fields": fields, "touched_records": touched, "rejected": rejected}, ensure_ascii=False, indent=2) + "\n")
    print(f"applied_unique={len(selected)} applied_fields={fields} touched_records={touched} rejected={len(rejected)}")


if __name__ == "__main__":
    main()
