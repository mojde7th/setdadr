FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir edge-tts==6.1.19
COPY tts_api.py .
ENV PORT=8787
EXPOSE 8787
CMD ["python", "tts_api.py"]
