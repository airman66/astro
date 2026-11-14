#!/bin/sh
set -eu

model=/models/Qwen3-Embedding-8B-Q4_K_M.gguf
part=/models/Qwen3-Embedding-8B-Q4_K_M.gguf.part
sha256=3fcd3febec8b3fd64435204db75bf0dd73b91e8d0661e0331acfe7e7c3120b85
url=https://huggingface.co/Qwen/Qwen3-Embedding-8B-GGUF/resolve/69d0e58a13e463cd99a9b83e3f5fee7c10265fab/Qwen3-Embedding-8B-Q4_K_M.gguf

if [ -f "$model" ]; then
    echo "$sha256  $model" | sha256sum -c -
    exit 0
fi

curl --fail --location --retry 4 --retry-delay 3 --continue-at - --output "$part" "$url"
echo "$sha256  $part" | sha256sum -c -
mv "$part" "$model"
