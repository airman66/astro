"""Register localized diagrams without overwriting their source images."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pytesseract
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def labels(path: Path, language: str) -> list[str]:
    with Image.open(path) as image:
        text = pytesseract.image_to_string(image.convert("RGB"), lang=language, config="--psm 11")
    return [line.strip() for line in text.splitlines() if line.strip()]


def main() -> None:
    journal_path = DATA / "image_edits.json"
    journal = json.loads(journal_path.read_text())
    existing = {item["media_id"]: item for item in journal["items"]}
    processed = list((DATA / "processed" / "terms").glob("*.json"))
    records = {path: json.loads(path.read_text()) for path in processed}
    for ru_path in sorted((DATA / "media" / "ru").glob("*")):
        if ru_path.name.startswith(".") or not ru_path.is_file():
            continue
        original_matches = list((DATA / "media" / "original").glob(ru_path.stem + ".*"))
        if len(original_matches) != 1:
            raise FileNotFoundError(f"Expected one original for {ru_path.stem}: {original_matches}")
        original_path = original_matches[0]
        media_id = ru_path.stem.replace("_", ":", 1)
        references = []
        source_url = ""
        digest = hashlib.sha256(ru_path.read_bytes()).hexdigest()
        for path, record in records.items():
            for item in record.get("media", []):
                if item["id"] != media_id:
                    continue
                references.append(record["id"])
                source_url = item["source_url"]
                item["ru_path"] = str(ru_path.relative_to(ROOT))
                item["ru_sha256"] = digest
        if not references:
            raise ValueError(f"No record refers to {media_id}")
        if media_id in existing:
            existing[media_id]["record_ids"] = sorted(set(references))
            existing[media_id]["ru_sha256"] = digest
            continue
        existing[media_id] = {
            "media_id": media_id,
            "record_ids": sorted(set(references)),
            "source_url": source_url,
            "original_path": str(original_path.relative_to(ROOT)),
            "ru_path": str(ru_path.relative_to(ROOT)),
            "ru_sha256": digest,
            "source_labels": labels(original_path, "eng"),
            "ru_labels": labels(ru_path, "rus+eng"),
            "status": "edited",
            "edited_at": datetime.now(timezone.utc).isoformat(),
            "reviewer_notes": "ChatGPT image editing; OCR inventory is provisional. Verify every label and scientific geometry before publication.",
        }
    for path, record in records.items():
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    journal["items"] = sorted(existing.values(), key=lambda item: item["media_id"])
    journal_path.write_text(json.dumps(journal, ensure_ascii=False, indent=2) + "\n")
    print(f"registered {len(journal['items'])} localized images")


if __name__ == "__main__":
    main()
