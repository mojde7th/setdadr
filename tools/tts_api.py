# -*- coding: utf-8 -*-
"""TTS API for SetYar — any Persian/English text → mp3 (Dilara).
Run:  python tools/tts_api.py
GET /tts?t=متن
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import edge_tts

HOST = "0.0.0.0"
PORT = 8787
VOICE = "fa-IR-DilaraNeural"
CACHE = Path(__file__).resolve().parents[1] / "voice" / "api-cache"
CACHE.mkdir(parents=True, exist_ok=True)


def cache_path(text: str) -> Path:
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()
    return CACHE / (h + ".mp3")


async def synth(text: str) -> bytes:
    text = re.sub(r"\s+", " ", text).strip()[:400]
    if not text:
        return b""
    path = cache_path(text)
    if path.exists() and path.stat().st_size > 80:
        return path.read_bytes()
    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, VOICE, rate="+6%")
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    data = buf.getvalue()
    if len(data) > 80:
        path.write_bytes(data)
    return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/health"):
            body = b"ok"
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path != "/tts":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        qs = parse_qs(parsed.query)
        text = unquote((qs.get("t") or qs.get("q") or [""])[0] or "").strip()
        if not text:
            self.send_response(400)
            self._cors()
            self.end_headers()
            return

        try:
            data = asyncio.run(synth(text))
        except Exception as e:
            msg = str(e).encode("utf-8")
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        if len(data) < 80:
            self.send_response(502)
            self._cors()
            self.end_headers()
            return

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("TTS listening on http://127.0.0.1:%s/tts?t=..." % PORT)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
