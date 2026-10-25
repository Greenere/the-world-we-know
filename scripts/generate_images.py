#!/usr/bin/env python3
"""Generate the imagined era sketches described in data/depictions/ with an image API.

    uv run --project scripts python scripts/generate_images.py --only city/constantinople --dry-run
    uv run --project scripts python scripts/generate_images.py --model gpt-image-2.5-flare --only city/constantinople/byzantion
    uv run --project scripts python scripts/generate_images.py --accept data/depictions/_candidates/<file>.webp

Pictures are organised by subject: data/depictions/<kind>/<id>/subject.json describes the fixed view and
each era, and accepted pictures sit beside it as <era>.webp with a <era>.json note of how each was made.
--only takes subjects (city/constantinople) or single eras (city/constantinople/ottoman), comma-separated;
without it, every era that has no accepted picture yet is drawn.

Each run writes candidates to data/depictions/_candidates/ (not committed) for review. An era with a
`base` is drawn as an edit of that era's accepted picture, so every era of a subject keeps the same view;
generate and accept them in order. See docs/image-api-guide.md.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import shutil
import sys
import time
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
WIDTH = 1536  # stored width; the build makes the smaller sizes the site serves

PROVIDERS = {
    # Model ids change often: check the provider's docs and pass --model to override.
    "openai": {"env": "OPENAI_API_KEY", "model": "gpt-image-2.5-flare"},
    "gemini": {"env": "GEMINI_API_KEY", "model": "gemini-3-pro-image-preview"},
}


def load_dotenv():
    """Read KEY=value lines from a git-ignored .env at the repo root, without overriding the environment."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.removeprefix("export ").split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def prompt_for(style: str, subject: dict, era: dict, edit: bool) -> str:
    parts = [style, "View: " + subject["view"], "This picture: " + era["prompt"]]
    if edit:
        parts.insert(0, "Redraw the attached sketch from exactly the same viewpoint, framing and drawing style. "
                        "Change only what the description below says has changed in this era; keep the land, "
                        "the shoreline and the composition as they are.")
    return "\n\n".join(parts)


def post_json(url: str, body: dict, headers: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    return send(req)


def send(req: urllib.request.Request) -> dict:
    # Rate limits, server errors and the occasional spurious "no access to model" (seen while a project's
    # model access is still propagating) usually clear on retry.
    for attempt, wait in enumerate((5, 15, 40, None)):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            transient = e.code in (429, 500, 502, 503, 504) or (e.code == 403 and "model_not_found" in body)
            if not transient or wait is None:
                sys.exit(f"error: {e.code} from {req.full_url}\n{body[:2000]}")
            print(f"  {e.code}; retrying in {wait}s …", flush=True)
            time.sleep(wait)


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
    m = json.loads(note.read_text())
    folder = IMAGES / m["subject"]
    shutil.copyfile(path, folder / f"{m['era']}.webp")
    shutil.copyfile(note, folder / f"{m['era']}.json")
    print(f"accepted {path.name} as data/depictions/{m['subject']}/{m['era']}.webp — run `npm run data` to use it")


def eras_to_draw(only: str | None) -> list[tuple[str, dict, dict]]:
    """(subject path, subject, era) for each era asked for, or for every era without an accepted picture."""
    wanted = {w.strip("/") for w in only.split(",")} if only else None
    out, seen = [], set()
    for f in sorted(IMAGES.glob("*/*/subject.json")):
        path = f"{f.parent.parent.name}/{f.parent.name}"
        subject = json.loads(f.read_text(encoding="utf-8"))
        for era in subject["eras"]:
            full = f"{path}/{era['id']}"
            if wanted is None:
                if not (f.parent / f"{era['id']}.webp").exists():
                    out.append((path, subject, era))
            elif path in wanted or full in wanted:
                out.append((path, subject, era))
                seen.update({path, full})
    if wanted and wanted - seen:
        sys.exit(f"error: unknown subjects or eras: {', '.join(sorted(wanted - seen))}")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--provider", choices=PROVIDERS, default="openai")
    ap.add_argument("--model", help="override the provider's default model id")
    ap.add_argument("--only", help="comma-separated subjects (city/constantinople) or eras (city/constantinople/ottoman)")
    ap.add_argument("--count", type=int, default=1, help="candidates per era")
    ap.add_argument("--dry-run", action="store_true", help="print the prompts and stop")
    ap.add_argument("--accept", type=Path, help="accept a candidate .webp from data/depictions/_candidates/")
    args = ap.parse_args()

    if args.accept:
        accept(args.accept)
        return

    style = json.loads((IMAGES / "style.json").read_text(encoding="utf-8"))["style"]
    items = eras_to_draw(args.only)

    load_dotenv()
    prov = PROVIDERS[args.provider]
    model = args.model or prov["model"]
    key = os.environ.get(prov["env"])
    if not key and not args.dry_run:
        sys.exit(f"error: set {prov['env']} in your environment or in .env at the repo root (see docs/image-api-guide.md)")
    CANDIDATES.mkdir(parents=True, exist_ok=True)

    for path, subject, era in items:
        name = f"{path}/{era['id']}"
        base_path = IMAGES / path / f"{era['base']}.webp" if era.get("base") else None
        if base_path and not base_path.exists():
            print(f"skip {name}: its base {era['base']} has no accepted picture yet")
            continue
        prompt = prompt_for(style, subject, era, edit=base_path is not None)
        if args.dry_run:
            print(f"── {name}{f'  (edit of {base_path.name})' if base_path else ''}\n{prompt}\n")
            continue
        base = to_png(base_path) if base_path else None
        for _ in range(args.count):
            print(f"{name}: generating with {args.provider}/{model}{' from ' + base_path.name if base_path else ''} …", flush=True)
            raw = (generate_openai if args.provider == "openai" else generate_gemini)(prompt, model, key, base)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            out = CANDIDATES / f"{name.replace('/', '__')}__{model}__{stamp}-{uuid.uuid4().hex[:4]}.webp"
            save_webp(raw, out)
            out.with_suffix(".png").write_bytes(raw)
            out.with_suffix(".json").write_text(json.dumps({
                "subject": path, "era": era["id"], "provider": args.provider, "model": model,
                "date": datetime.now(timezone.utc).date().isoformat(),
                "base": era.get("base"), "prompt": prompt,
            }, ensure_ascii=False, indent=2))
            print(f"  → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
