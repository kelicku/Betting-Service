"""参考画像と撮影結果を比較する（backend/.venv/bin/python tools/compare/compare.py）。

DESIGN=waku（既定）：references/Colorful Fantasy Gacha Game Landing Page.png と比較（フッターは参考画像にないため比較しない）
DESIGN=hoshifuru：旧デザインの参考画像と比較

- 撮影結果を参考画像の幅（887px）に縮小
- 横並び画像（reference | current）と差分のヒートマップを出力
- セクションごとの平均差分（0〜100、小さいほど一致）を表示し、記録に追記する
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
DESIGN = os.environ.get("DESIGN", "waku")
OUT = ROOT / "tools" / "compare" / "out"
CUR = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "current-1440.png"
if DESIGN == "waku":
    REF = ROOT / "references" / "Colorful Fantasy Gacha Game Landing Page.png"
    LOG = ROOT / "tools" / "compare" / "history-waku.json"
    # 参考画像上のセクション境界（docs/design/reference-analysis-waku.md）
    SECTIONS = [("header", 0, 60), ("hero", 60, 548), ("promo", 548, 678), ("pickup", 678, 952), ("lineup", 952, 1152), ("howto", 1152, 1340), ("exchange", 1340, 1536)]
else:
    REF = ROOT / "references" / "homepage-reference.png"
    LOG = ROOT / "tools" / "compare" / "history.json"
    # 参考画像上のセクション境界（docs/design/reference-analysis.md）
    SECTIONS = [("header", 0, 50), ("hero", 50, 515), ("banners", 515, 640), ("features", 640, 815), ("gacha", 815, 1135), ("prizes", 1135, 1365), ("news", 1365, 1595), ("footer", 1595, 1774)]

ref = Image.open(REF).convert("RGB")
cur = Image.open(CUR).convert("RGB")
scale = ref.width / cur.width
cur_s = cur.resize((ref.width, round(cur.height * scale)), Image.LANCZOS)
print(f"current: {cur.size} -> {cur_s.size}  reference: {ref.size}  height ratio: {cur_s.height / ref.height:.3f}")

# セクションごとに切り出し、参考画像の同じセクションの大きさに合わせて並べ直す（位置ずれではなく内容の差を見る）
boxes_path = CUR.with_suffix(".json")
if boxes_path.exists():
    boxes = json.loads(boxes_path.read_text())
    cmp = Image.new("RGB", ref.size)
    for name, y0, y1 in SECTIONS:
        c0, c1 = boxes[name]
        part = cur.crop((0, c0, cur.width, c1)).resize((ref.width, y1 - y0), Image.LANCZOS)
        cmp.paste(part, (0, y0))
else:
    cmp = cur_s.resize(ref.size, Image.LANCZOS)
a = np.asarray(ref.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)
b = np.asarray(cmp.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)
diff = np.abs(a - b).mean(axis=2)  # 0〜255

scores = {}
for name, y0, y1 in SECTIONS:
    scores[name] = round(float(diff[y0:y1].mean()) / 2.55, 1)
scores["overall"] = round(float(diff.mean()) / 2.55, 1)
for k, v in scores.items():
    print(f"  {k:9s} {v:5.1f}")

OUT.mkdir(parents=True, exist_ok=True)
heat = Image.fromarray(np.clip(diff * 2.5, 0, 255).astype(np.uint8)).convert("L")
heat_rgb = Image.merge("RGB", (heat, Image.new("L", heat.size, 0), Image.eval(heat, lambda v: 255 - v)))
side = Image.new("RGB", (ref.width * 3 + 16, ref.height), (30, 30, 40))
side.paste(ref, (0, 0))
side.paste(cmp, (ref.width + 8, 0))
side.paste(heat_rgb, (ref.width * 2 + 16, 0))
d = ImageDraw.Draw(side)
for _, y0, _ in SECTIONS[1:]:
    d.line([(0, y0), (side.width, y0)], fill=(255, 220, 120), width=1)
side.save(OUT / "side-by-side.png")
cur_s.save(OUT / f"current-{ref.width}.png")
hist = json.loads(LOG.read_text()) if LOG.exists() else []
hist.append({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "height_ratio": round(cur_s.height / ref.height, 3), "scores": scores})
LOG.write_text(json.dumps(hist, ensure_ascii=False, indent=2))
print(f"saved {OUT / 'side-by-side.png'}")
