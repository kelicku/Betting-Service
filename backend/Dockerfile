FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd -m -u 10001 app && mkdir -p var/uploads && chown -R app var
USER app
EXPOSE 8000
# 起動時にマイグレーションを適用してから API を起動する。
# X-Forwarded-For はプライベートネットワーク（フロントエンド・LB）からのものだけを信頼する（IP 偽装によるレート制限回避を防ぐ）
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host ${BIND_HOST:-0.0.0.0} --port 8000 --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16} --workers ${WEB_CONCURRENCY:-2}"]
