"""CPU search over a verified Runpod-built FAISS index."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from threading import Lock

DATA = Path(os.getenv("DATA_DIR", "data"))
_lock = Lock()
_loaded = None


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load():
    global _loaded
    if _loaded is not None:
        return _loaded
    root = DATA / "index"
    if not (root / "index-manifest.json").exists():
        return None
    with _lock:
        if _loaded is not None:
            return _loaded
        import faiss
        manifest = json.loads((root / "index-manifest.json").read_text())
        for name, expected in (("chunks.jsonl", manifest["chunks_sha256"]), ("index.faiss", manifest["index_sha256"]), ("vector-map.json", manifest["vector_map_sha256"])):
            if checksum(root / name) != expected:
                raise ValueError(f"Index file checksum mismatch: {name}")
        index = faiss.read_index(str(root / "index.faiss"))
        mapping = json.loads((root / "vector-map.json").read_text())
        chunks = {row["id"]: row for row in (json.loads(line) for line in (root / "chunks.jsonl").read_text().splitlines())}
        if index.ntotal != manifest["chunk_count"] or len(mapping) != index.ntotal or index.d != manifest["dimension"]:
            raise ValueError("Index manifest count/dimension mismatch")
        model_path = DATA / "models" / manifest["model_file"]
        if checksum(model_path) != manifest["model_sha256"]:
            raise ValueError("Embedding model checksum mismatch")
        if manifest["model"] != "Qwen/Qwen3-Embedding-8B-GGUF" or manifest["pooling"] != "last":
            raise ValueError("Unsupported embedding model or pooling")
        _loaded = index, mapping, chunks, manifest
        return _loaded


def search(query: str, locale: str, limit: int = 20) -> list[dict]:
    loaded = load()
    if loaded is None:
        return []
    index, mapping, chunks, manifest = loaded
    import numpy as np
    import requests

    prompt = f"Instruct: {manifest['query_instruction']}\nQuery: {query}"
    url = os.getenv("EMBEDDING_URL", "http://127.0.0.1:8080/v1/embeddings")
    response = requests.post(url, json={"input": prompt, "model": manifest["model"], "encoding_format": "float"}, timeout=120)
    response.raise_for_status()
    vector = np.asarray([response.json()["data"][0]["embedding"]], dtype="float32")
    if vector.shape[1] != index.d:
        raise ValueError("Query embedding dimension differs from index")
    scores, identifiers = index.search(vector, min(index.ntotal, limit * 4))
    result = []
    for score, identifier in zip(scores[0], identifiers[0]):
        if identifier < 0:
            continue
        chunk = chunks[mapping[int(identifier)]["chunk_id"]]
        if chunk["locale"] != locale:
            continue
        result.append({"record_id": chunk["record_id"], "section_id": chunk["section_id"], "kind": chunk["kind"], "title": chunk["title"], "excerpt": chunk["text"][:400], "url": chunk["url"], "review_status": chunk["review_status"], "score": float(score)})
        if len(result) >= limit:
            break
    return result
