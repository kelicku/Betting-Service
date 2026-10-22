#!/usr/bin/env bash
# デモ用の一時リンク（Cloudflare クイックトンネル）を作る・止める。
#
#   ./scripts/demo-link.sh          サイトを起動してリンクを表示する（今のリンクが使えればそのまま。PC の再起動後もこれ 1 つで OK）
#   ./scripts/demo-link.sh new      リンクを作り直す（アドレスが変わります）
#   ./scripts/demo-link.sh stop     リンクを止める（サイトは動かしたまま）
#   ./scripts/demo-link.sh status   今のリンクと状態を表示する
#
# ・リンク（https://xxxx.trycloudflare.com）は、作り直すたびに変わります。PC が動いている間だけ使えます。
# ・バックエンドの PUBLIC_BASE_URL をリンクに合わせて設定し直すため、リンク経由でもログインできます。
# ・必要なもの：docker compose、cloudflared
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/.demo"
LOG="$STATE/tunnel.log"
PIDFILE="$STATE/tunnel.pid"
OVERRIDE="$STATE/tunnel.override.yml"
URLFILE="$STATE/url"
cd "$ROOT"
mkdir -p "$STATE"

compose() {
  if [[ -f "$OVERRIDE" ]]; then docker compose -f docker-compose.yml -f "$OVERRIDE" "$@"; else docker compose "$@"; fi
}

stop_tunnel() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    kill "$(cat "$PIDFILE")" && echo "リンクを止めました。"
  fi
  rm -f "$PIDFILE"
}

case "${1:-start}" in
  stop)
    stop_tunnel
    exit 0
    ;;
  status)
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null && [[ -f "$URLFILE" ]]; then
      url="$(cat "$URLFILE")"
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url/" || true)"
      echo "リンク：$url（応答 $code）"
    else
      echo "リンクは動いていません。./scripts/demo-link.sh で作成できます。"
    fi
    exit 0
    ;;
  start | new) ;;
  *) echo "使い方：$0 [start|new|stop|status]"; exit 2 ;;
esac

command -v cloudflared >/dev/null || { echo "cloudflared がインストールされていません。"; exit 1; }

echo "1/4 サイトを起動しています…"
compose up -d --wait >/dev/null 2>&1
curl -sf -o /dev/null --max-time 20 http://localhost:3300/ || { echo "サイト（http://localhost:3300）が応答しません。docker compose logs で確認してください。"; exit 1; }

# 今のリンクが動いていて応答があれば、作り直さずにそのまま使う（お客さまに送ったアドレスが変わらないように）
if [[ "${1:-start}" == "start" && -f "$PIDFILE" && -f "$URLFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  url="$(cat "$URLFILE")"
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url/" || true)" == "200" ]]; then
    echo
    echo "✅ デモ用リンク（今のリンクをそのまま使います）：$url"
    echo "   デモ会員：demo@hoshifuru.example / demo12345（または「ワンクリックでログイン」）"
    echo "   作り直すとき：./scripts/demo-link.sh new"
    exit 0
  fi
fi

echo "2/4 Cloudflare のリンクを作成しています…"
stop_tunnel
: > "$LOG"
nohup cloudflared tunnel --no-autoupdate --url http://localhost:3300 >"$LOG" 2>&1 &
echo $! > "$PIDFILE"
url=""
for _ in $(seq 1 60); do
  url="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [[ -n "$url" ]] && break
  sleep 1
done
[[ -n "$url" ]] || { echo "リンクを作成できませんでした（$LOG を確認してください）。"; exit 1; }
echo "$url" > "$URLFILE"

echo "3/4 バックエンドの設定をリンクに合わせています…"
cat > "$OVERRIDE" <<YAML
# demo-link.sh が自動で作成（手で編集しない）
services:
  backend:
    environment:
      PUBLIC_BASE_URL: $url
      ALLOWED_ORIGINS: http://localhost:3300
YAML
compose up -d --wait backend >/dev/null 2>&1

echo "4/4 リンクを確認しています…"
ok=""
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url/" || true)"
  [[ "$code" == "200" ]] && { ok=1; break; }
  sleep 2
done
echo
if [[ -n "$ok" ]]; then
  echo "✅ デモ用リンク：$url"
else
  echo "⚠️  リンクは作成しましたが、まだ応答がありません（数十秒後にもう一度開いてください）：$url"
fi
echo "   デモ会員：demo@hoshifuru.example / demo12345（または「ワンクリックでログイン」）"
echo "   止めるとき：./scripts/demo-link.sh stop"
