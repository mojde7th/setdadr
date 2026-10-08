Deploy SetYar Dilara TTS on Liara (Iran-friendly permanent server)
=================================================================

1) Make account on https://console.liara.ir
2) Create a Docker app named: setdadr-tts  (port 8787)
3) Install CLI:  npm i -g @liara/cli
4) Login:       liara login
5) From this folder:

   liara deploy --app setdadr-tts --port 8787 --path .

6) Copy the app URL, e.g. https://setdadr-tts.liara.run
7) Put it in repo file tts-endpoint.js:

   window.SETDADR_TTS_API = "https://setdadr-tts.liara.run";

8) Commit + push setdadr so the phone picks it up.

Test:
  https://YOUR-APP.liara.run/health
  https://YOUR-APP.liara.run/tts?t=scout
  https://YOUR-APP.liara.run/tts?t=حرکت بعد
