#!/usr/bin/env python3
"""Generate the imagined sketches in data/depictions.json with an image API.

    uv run --project scripts python scripts/generate_images.py --provider openai --only constantinople-byzantion
    uv run --project scripts python scripts/generate_images.py --accept data/depictions/_candidates/<file>.webp

Each run writes candidates to data/depictions/_candidates/ (not committed) for review; --accept copies
one to data/depictions/<id>.webp with a <id>.json note of how it was made, which replaces the placeholder
on the next `npm run data`. A depiction with a `base` is drawn as an edit of the accepted base image, so
every era of a city keeps the same view; generate and accept them in order. See docs/image-api-guide.md.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
IMAGES = DATA / "depictions"
CANDIDATES = IMAGES / "_candidates"
WIDTH = 1536  # stored width; the card shows ~330 px, the enlarged view up to ~1100 px

PROVIDERS = {
    # Model ids change often: check the provider's docs and pass --model to override.
    "openai": {"env": "OPENAI_API_KEY", "model": "gpt-image-2"},
    "gemini": {"env": "GEMINI_API_KEY", "model": "gemini-3-pro-image-preview"},
}


def prompt_for(doc: dict, d: dict, edit: bool) -> str:
    parts = [doc["style"], "View: " + doc["views"][d["city"]], "This picture: " + d["prompt"]]
    if edit:
        parts.insert(0, "Redraw the attached sketch from exactly the same viewpoint, framing and drawing style. "
                        "Change only what the description below says has changed in this era; keep the land, "
                        "the shoreline and the composition as they are.")
    return "\n\n".join(parts)


def post_json(url: str, body: dict, headers: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    return send(req)


def send(req: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"error: {e.code} from {req.full_url}\n{e.read().decode(errors='replace')[:2000]}")


def multipart(fields: dict[str, str], files: list[tuple[str, str, bytes]]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for name, filename, data in files:
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                  f"Content-Type: image/png\r\n\r\n".encode())
        out.write(data + b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def generate_openai(prompt: str, model: str, key: str, base: bytes | None) -> bytes:
    headers = {"Authorization": f"Bearer {key}"}
    if base is None:
        res = post_json("https://api.openai.com/v1/images/generations",
                        {"model": model, "prompt": prompt, "size": "1536x1024", "quality": "high", "n": 1}, headers)
    else:
        body, ctype = multipart({"model": model, "prompt": prompt, "size": "1536x1024", "quality": "high"},
                                [("image[]", "base.png", base)])
        res = send(urllib.request.Request("https://api.openai.com/v1/images/edits", data=body,
                                          headers={**headers, "Content-Type": ctype}))
    return base64.b64decode(res["data"][0]["b64_json"])


def generate_gemini(prompt: str, model: str, key: str, base: bytes | None) -> bytes:
    parts: list[dict] = [{"text": prompt}]
    if base is not None:
        parts.append({"inline_data": {"mime_type": "image/png", "data": base64.b64encode(base).decode()}})
    res = post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        {"contents": [{"parts": parts}],
         "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "3:2"}}},
        {"x-goog-api-key": key},
    )
    for cand in res.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = part.get("inlineData") or part.get("inline_data")
            if data:
                return base64.b64decode(data["data"])
    sys.exit(f"error: no image in the response\n{json.dumps(res)[:2000]}")


def to_png(path: Path) -> bytes:
    buf = io.BytesIO()
    Image.open(path).convert("RGB").save(buf, "PNG")
    return buf.getvalue()


def save_webp(raw: bytes, path: Path):
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width > WIDTH:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    img.save(path, "WEBP", quality=80, method=6)


def accept(path: Path):
    note = path.with_suffix(".json")
    if not path.exists() or not note.exists():
        sys.exit(f"error: {path} (and its .json note) not found")
    did = json.loads(note.read_text())["id"]
    shutil.copyfile(path, IMAGES / f"{did}.webp")
    shutil.copyfile(note, IMAGES / f"{did}.json")
    print(f"accepted {path.name} as data/depictions/{did}.webp — run `npm run data` to use it")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--provider", choices=PROVIDERS, default="openai")
    ap.add_argument("--model", help="override the provider's default model id")
    ap.add_argument("--only", help="comma-separated depiction ids (default: every one without an accepted image)")
    ap.add_argument("--count", type=int, default=1, help="candidates per depiction")
    ap.add_argument("--dry-run", action="store_true", help="print the prompts and stop")
    ap.add_argument("--accept", type=Path, help="accept a candidate .webp from data/depictions/_candidates/")
    args = ap.parse_args()

    if args.accept:
        accept(args.accept)
        return

    doc = json.loads((DATA / "depictions.json").read_text(encoding="utf-8"))
    wanted = set(args.only.split(",")) if args.only else None
    items = [d for d in doc["depictions"] if (d["id"] in wanted if wanted else not (IMAGES / f"{d['id']}.webp").exists())]
    if wanted and len(items) != len(wanted):
        sys.exit(f"error: unknown ids: {', '.join(sorted(wanted - {d['id'] for d in items}))}")

    prov = PROVIDERS[args.provider]
    model = args.model or prov["model"]
    key = os.environ.get(prov["env"])
    if not key and not args.dry_run:
        sys.exit(f"error: set {prov['env']} in your environment first (see docs/image-api-guide.md)")
    CANDIDATES.mkdir(parents=True, exist_ok=True)

    for d in items:
        base_path = IMAGES / f"{d['base']}.webp" if d.get("base") else None
        if base_path and not base_path.exists():
            print(f"skip {d['id']}: its base {d['base']} has no accepted image yet")
            continue
        prompt = prompt_for(doc, d, edit=base_path is not None)
        if args.dry_run:
            print(f"── {d['id']}{f'  (edit of {base_path.name})' if base_path else ''}\n{prompt}\n")
            continue
        base = to_png(base_path) if base_path else None
        for n in range(args.count):
            print(f"{d['id']}: generating with {args.provider}/{model}{' from ' + base_path.name if base_path else ''} …", flush=True)
            raw = (generate_openai if args.provider == "openai" else generate_gemini)(prompt, model, key, base)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            out = CANDIDATES / f"{d['id']}__{args.provider}__{stamp}-{n}.webp"
            save_webp(raw, out)
            out.with_suffix(".png").write_bytes(raw)
            out.with_suffix(".json").write_text(json.dumps({
                "id": d["id"], "provider": args.provider, "model": model,
                "date": datetime.now(timezone.utc).date().isoformat(),
                "base": d.get("base"), "prompt": prompt,
            }, ensure_ascii=False, indent=2))
            print(f"  → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
