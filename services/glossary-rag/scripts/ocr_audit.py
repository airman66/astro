"""Inventory visible labels before ChatGPT image localization."""
from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pytesseract
from PIL import Image
from pytesseract import Output


def scan(path: Path) -> dict:
    try:
        with Image.open(path) as image:
            dimensions = image.size
            image.thumbnail((2400, 2400))
            recognized = pytesseract.image_to_data(image.convert("RGB"), lang="eng", output_type=Output.DICT, config="--psm 11", timeout=45)
        words = []
        for i, value in enumerate(recognized["text"]):
            if value.strip() and float(recognized["conf"][i]) >= 45:
                words.append({"text": value.strip(), "confidence": float(recognized["conf"][i]), "box": [recognized[key][i] for key in ("left", "top", "width", "height")]})
        return {"path": str(path), "size": dimensions, "words": words, "error": None}
    except Exception as exc:
        return {"path": str(path), "words": [], "error": str(exc)[:160]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=("diagram", "media", "all"), default="all")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    paths = sorted(Path("data/media/original").glob("*"))
    if args.kind != "all":
        paths = [path for path in paths if path.name.startswith(args.kind + "_")]
    existing_file = Path("data/image_ocr.json")
    existing = {row["path"]: row for row in json.loads(existing_file.read_text())} if existing_file.exists() else {}
    pending = [path for path in paths if str(path) not in existing]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in as_completed([pool.submit(scan, path) for path in pending]):
            row = future.result()
            existing[row["path"]] = row
            if len(existing) % 20 == 0:
                existing_file.write_text(json.dumps(list(existing.values()), ensure_ascii=False, indent=2) + "\n")
                print(f"audited {len(existing)}", flush=True)
    existing_file.write_text(json.dumps(list(existing.values()), ensure_ascii=False, indent=2) + "\n")
    print(f"audited={len(paths)} with_text={sum(bool(existing[str(path)]['words']) for path in paths)}")


if __name__ == "__main__":
    main()
