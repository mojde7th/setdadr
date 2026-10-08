# -*- coding: utf-8 -*-
"""پخت آفلاین صدای هر متن فارسی دلخواه برای ست‌یار.
Usage:
  python tools/bake_voice.py "انییتتیای"
  python tools/bake_voice.py "قوطی قرمز آبی" "لانگز دیوار"
"""
import asyncio
import hashlib
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "voice" / "dyn"
VOICE_FA = "fa-IR-DilaraNeural"
VOICE_EN = "en-US-JennyNeural"


def key_for(text: str) -> str:
    t = " ".join(text.split())
    return hashlib.sha1(t.encode("utf-8")).hexdigest()[:16]


def pick_voice(text: str) -> str:
    if re.search(r"[\u0600-\u06FF]", text):
        return VOICE_FA
    return VOICE_EN


async def bake(text: str) -> Path:
    t = " ".join(text.split())
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / (key_for(t) + ".mp3")
    voice = pick_voice(t)
    await edge_tts.Communicate(t, voice, rate="+8%").save(str(path))
    print(path.name, repr(t), voice, path.stat().st_size)
    return path


async def main(argv):
    texts = argv[1:] or []
    if not texts:
        print('Usage: python tools/bake_voice.py "متن یک" "متن دو"')
        return 1
    for t in texts:
        await bake(t)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv)))
