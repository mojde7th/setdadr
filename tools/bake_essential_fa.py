# -*- coding: utf-8 -*-
"""Bake Dilara Persian clips into voice/dyn for offline speakTextChain."""
import asyncio
import hashlib
import re
import sys
from pathlib import Path

import edge_tts

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
OUT = Path(__file__).resolve().parents[1] / "voice" / "dyn"
OUT.mkdir(parents=True, exist_ok=True)
PHRASES = [
    "نصفشو رفتی",
    "بیشتر از نصفش رفتی",
    "حرکت بعد",
    "عالی",
    "آفرین، تمرین تمام شد",
    "خیلی عالی بود",
    "اسکوات",
    "ایر اسکوات",
    "گبلت اسکوات",
    "شنا",
    "شنا سوئدی",
    "لانج",
    "لانگز",
    "پلانک",
    "برپی",
    "بارفیکس",
    "ددلیفت",
    "ددلیفت رومانیایی",
    "آر دی ال",
    "جامپینگ جک",
    "مانتین کلایمر",
    "کرانچ",
    "دراز و نشست",
    "هیپ تراست",
    "بریج باسن",
    "وال سیت",
    "دیوارنشینی",
    "دیوار نشینی",
    "ساق پا",
    "جلو بازو",
    "دیپ پشت بازو",
    "پرس شانه",
    "پرس سینه",
    "نشر جانب",
    "سوئینگ کتل بل",
    "روئینگ",
    "روئینگ خم",
    "زانو بلند",
    "پاشنه به باسن",
    "پای بالا",
    "راشن توییست",
    "پرش روی باکس",
    "اسکوات پرشی",
    "اسکوات سومو",
    "پلانک بغل",
    "هالو هولد",
    "راه رفتن کشاورز",
    "بتل روپ",
    "طناب",
    "یوگا",
    "کشش",
    "جامپ",
    "دوی درجا",
    "استراحت بین ست",
    "ست تازه",
    "تمام",
    "یک ست از چهار ست رو رفتی، استراحت بین ست",
    "دو ست از چهار ست رو رفتی، استراحت بین ست",
    "سه ست از چهار ست رو رفتی، استراحت بین ست",
    "چهار ست از چهار ست رو رفتی، استراحت بین ست",
]


async def one(text: str) -> None:
    key = re.sub(r"\s+", " ", text).strip()[:160]
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    path = OUT / (h + ".mp3")
    if path.exists() and path.stat().st_size > 80:
        print("skip", h, key)
        return
    await edge_tts.Communicate(key, "fa-IR-DilaraNeural", rate="+5%", volume="+50%").save(
        str(path)
    )
    print("ok", h, path.stat().st_size, key)


async def main() -> None:
    for t in PHRASES:
        try:
            await one(t)
        except Exception as e:
            print("fail", t, type(e).__name__, e)


if __name__ == "__main__":
    asyncio.run(main())
