"""OpenAI API キーの読み込み（.env の OPEN_API_KEY）。キーは表示・保存しない。"""
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def api_key() -> str:
    env = os.environ.get("OPEN_API_KEY")
    if env:
        return env.strip()
    text = (ROOT / ".env").read_text(encoding="utf-8-sig")
    m = re.search(r'^\s*(?:export\s+)?OPEN_API_KEY\s*=\s*["\']?([^"\'\r\n]+)', text, re.M)
    if not m:
        raise SystemExit("OPEN_API_KEY が .env に見つかりません")
    return m.group(1).strip()
