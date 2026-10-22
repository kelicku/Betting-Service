"""参考画像から画像素材を作る（OpenAI 画像編集 API）。

使い方:
  backend/.venv/bin/python tools/imagegen/generate.py hero_bg character   # 指定した素材だけ
  backend/.venv/bin/python tools/imagegen/generate.py --list              # 素材一覧と生成状況
  オプション: --force（生成済みでも作り直す） --quality high|xhigh|max

- 生成済みの素材はスキップする（同じ画像を何度も生成しない）
- 実際の使用トークンと概算費用を tools/imagegen/manifest.json に記録する
- API キーは .env の OPEN_API_KEY から読み込み、表示・保存しない
"""

import argparse
import base64
import io
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from env import ROOT, api_key  # noqa: E402

REF = ROOT / "references" / "homepage-reference.png"
REF_WAKU = ROOT / "references" / "Colorful Fantasy Gacha Game Landing Page.png"
OUT = ROOT / "frontend" / "public" / "images"
WORK = ROOT / "tools" / "imagegen" / "work"
MANIFEST = ROOT / "tools" / "imagegen" / "manifest.json"
LOCK = threading.Lock()
MODEL = "gpt-image-2.5-sunburst"  # 編集の再現性を優先（公式ドキュメント：精度重視の編集に推奨）
PRICE_IN_IMAGE = 8 / 1e6
PRICE_IN_TEXT = 5 / 1e6
PRICE_OUT_IMAGE = 30 / 1e6

STYLE = (
    "Keep the exact same anime illustration style, color palette (deep navy, royal purple, amethyst, antique gold, "
    "champagne gold highlights), soft magical glow and lighting as the input image."
)


@dataclass
class Job:
    out: str  # public/images 以下の保存先
    crop: tuple[int, int, int, int]  # 参考画像から切り出す範囲
    size: str
    prompt: str
    transparent: bool = False
    extra: dict = field(default_factory=dict)
    ref: Path = REF  # 切り出し元の参考画像


JOBS: dict[str, Job] = {
    "hero_bg": Job(
        out="hero/palace-bg.webp",
        crop=(0, 0, 887, 515),
        size="2496x1440",
        prompt=(
            "Remove the girl character, every piece of text, the logo, the navigation bar, the search/login/register buttons, "
            "the pink button and the three statistic icons from this image. Seamlessly reconstruct the palace interior that was "
            "hidden behind them: tall pillars, gothic arches, golden chandeliers with warm candle light, the large arched window "
            "showing a starry night sky and a glowing fairy-tale castle, balconies with lanterns, and glowing purple and blue "
            "crystal clusters at the bottom-left. Keep the exact same composition, perspective, camera framing and lighting. "
            "Clean high-resolution background illustration with no people, no characters and no text. " + STYLE
        ),
    ),
    "character": Job(
        out="hero/heroine.webp",
        crop=(380, 52, 887, 515),
        size="1536x1408",
        transparent=True,
        prompt=(
            "Isolate the anime girl from this image and redraw her at high resolution with exactly the same design: the same face, "
            "large blue-violet eyes, gentle smile, long silver-lavender hair with flowing strands, the navy blue flower and ribbon "
            "hair ornament with small blue gems, the dark navy and ivory royal gown with intricate gold embroidery, white lace frills "
            "at the sleeves, and the same hand pose holding the glowing golden armillary sphere with a shining star inside. "
            "Keep the same pose, framing, crop and warm rim lighting. The gown is elegant and fully covers her shoulders, arms and body. "
            "Remove the entire background, all text and UI: output only the character on a fully transparent background. "
            "Do not change her identity or design. " + STYLE
        ),
    ),
}

REDRAW = (
    "Redraw this exact illustration at high resolution, keeping the same composition, subject, colors and details. "
    "Remove every piece of text, label, badge, date, number and button and seamlessly reconstruct what was behind them. "
    "No text at all in the output. "
)

JOBS.update({
    # キャンペーンバナー（文字は HTML で重ねる）
    "banner_pickup": Job("banners/pickup-moonlit-jewel.webp", (60, 522, 327, 630), "1536x624",
        REDRAW + "The silver-haired anime girl with jeweled ornaments should stay on the right side; keep the left side calm for text. " + STYLE),
    "banner_new": Job("banners/new-constellation.webp", (335, 522, 582, 630), "1536x624",
        REDRAW + "Keep the glowing celestial crystal orb and planets on the right; keep the left side calm for text. " + STYLE),
    "banner_lastone": Job("banners/lastone-miracle.webp", (590, 522, 830, 630), "1536x624",
        REDRAW + "Keep the ornate treasure chest overflowing with purple crystals on the right and the pink magical glow; keep the left side calm for text. " + STYLE),
    # 楽しみ方のアイコン（金の円は CSS で描くため、中のアイコンだけを透過で）
    "feature_icons": Job("features/icons-sheet.png", (60, 645, 830, 740), "1024x1024",
        "Using the input image only as a style reference, create a 2x2 grid of four separate 3D game icons in the same luxurious "
        "gold and magical style, each centered in its own quadrant with generous empty space around it, no circles or frames: "
        "top-left a golden admission ticket with a star, top-right a pink crystal ball on a golden stand, bottom-left a golden gift "
        "box with a red ribbon, bottom-right a golden delivery truck. Soft glow, high detail, no text. Fully transparent background.",
        transparent=True),
    # ガチャカードの画像
    "gacha_aurora": Job("gacha/aurora-prayer.webp", (41, 880, 240, 1005), "1152x720",
        REDRAW + "Keep the purple and lavender aurora fantasy forest with the glowing fairy-like crystal flower on the right. " + STYLE),
    "gacha_accessory": Job("gacha/starfall-accessory.webp", (251, 880, 445, 1005), "1152x720",
        REDRAW + "Keep the large glowing celestial glass orb and starry jewelry scene. " + STYLE),
    "gacha_premium": Job("gacha/premium-figure.webp", (457, 880, 651, 1005), "1152x720",
        REDRAW + "Keep the deep red and gold premium treasure display with glowing red gems. " + STYLE),
    "gacha_legend": Job("gacha/legendary-chest.webp", (662, 880, 853, 1005), "1152x720",
        REDRAW + "Keep the radiant golden legendary treasure chest with blue crystals and golden light. " + STYLE),
    # 注目の景品
    "prize_figure": Job("prizes/original-figure.webp", (49, 1206, 143, 1308), "1024x1024",
        REDRAW + "A premium collectible anime figure of the silver-haired girl in a royal gown, displayed in a glowing frame. " + STYLE),
    "prize_pendant": Job("prizes/magic-pendant.webp", (157, 1206, 250, 1308), "1024x1024",
        REDRAW + "A glowing violet crystal pendant on a golden chain. " + STYLE),
    "prize_illust": Job("prizes/starry-illustration.webp", (264, 1206, 358, 1308), "1024x1024",
        REDRAW + "A framed original illustration of a girl under a starry night sky with crystals. " + STYLE),
    "prize_plush": Job("prizes/star-plush.webp", (373, 1206, 467, 1308), "1024x1024",
        REDRAW + "A cute white fluffy creature plush toy with long ears, sitting with glowing crystals. " + STYLE),
    "prize_goods": Job("prizes/treasury-goods.webp", (482, 1206, 577, 1308), "1024x1024",
        REDRAW + "An original goods set: illustrated cards, acrylic stand and small items with pink glow. " + STYLE),
    # パネル
    "panel_treasure": Job("panels/treasure-chest.webp", (597, 1188, 860, 1356), "1536x976",
        REDRAW + "Keep the ornate treasure chest overflowing with purple crystals on the right and the small white fluffy creature in front of it; keep the upper-left area calm and empty for text. " + STYLE),
    "panel_beginner": Job("panels/beginner-guide.webp", (425, 1377, 850, 1492), "1920x640",
        REDRAW + "Keep the cute white fluffy creature with a golden star on the right half and the starry sky; keep the left half calm and dark for text. " + STYLE),
    # 装飾・背景
    "side_crystals": Job("decor/side-crystals.png", (0, 640, 110, 1360), "1024x3072",
        "Using the input image as a style reference, create a tall vertical decorative border strip: clusters of glowing purple and blue "
        "crystals, small golden lanterns with warm light, golden filigree and sparkles stacked from top to bottom along the left edge. "
        "The right two thirds are empty. No text. Fully transparent background.", transparent=True),
    "section_bg": Job("decor/palace-dark-bg.webp", (0, 0, 887, 515), "2496x1248",
        "Using the input image as a style reference, paint a very dark, low-contrast palace interior for a website section background: "
        "deep navy and royal purple, faint gothic pillars and arches on both sides, subtle golden ornaments and tiny sparkles, "
        "the center area almost plain dark navy so text and cards stay readable. No people, no text. " + STYLE),
})


# ---- わくわくガチャ（references/Colorful Fantasy Gacha Game Landing Page.png、1024×1536）----
WSTYLE = (
    "Keep the exact same bright, colorful, cute Japanese mobile-game illustration style, pastel palette (sky blue, pink, "
    "cream, gold), soft glossy shading and sparkles as the input image."
)
NO_BRAND = (
    "Absolutely no brand logos, trademarks, product names or recognizable branded products: everything must be generic "
    "and unbranded."
)
NO_TEXT = "Remove every piece of text, label, badge, number and button and seamlessly reconstruct what was behind them. No text at all. "


def W(out, crop, size, prompt, transparent=False):
    return Job(out=f"waku/{out}", crop=crop, size=size, prompt=prompt, transparent=transparent, ref=REF_WAKU)


ISOLATE = "Remove the entire background and output only the object on a fully transparent background. "
JOBS.update({
    "w_hero_bg": W("hero-bg.webp", (0, 0, 1024, 550), "2048x1104",
        "Remove the top navigation bar, every piece of text, the crown above the text, the pink button, the cat, the treasure "
        "chest and the gold coins and gems around the chest from this image. Seamlessly reconstruct the scenery hidden behind "
        "them: blue sky with fluffy white clouds, the fairy-tale castle with pink walls and blue roofs on the hill, waterfalls, "
        "the stone stairway and bridge, soft pink cloud banks and pink and white flowers in the foreground on both sides. "
        "Keep the exact same composition, perspective, framing and lighting. Clean background illustration with no characters, "
        "no animals and no text. " + WSTYLE),
    "w_hero_cat": W("hero-cat.png", (500, 180, 1024, 550), "1536x1088",
        "Isolate the happy calico kitten sitting in the open treasure chest, together with the treasure chest, the gold coins "
        "marked P, the pink, purple and blue gems and the sparkles around it, and redraw them at high resolution with exactly "
        "the same design, pose, expression (closed happy eyes, open smiling mouth, raised paws), blue bow tie with pink gem and "
        "framing. " + ISOLATE + WSTYLE, True),
    "w_promo_icons": W("promo-icons.png", (40, 548, 985, 668), "1536x512",
        "From this banner row, keep only the three illustrations: the pink gift box with a pink ribbon (left), the blue "
        "clipboard with a checklist and a pencil (center) and the stack of orange, cream and purple gift boxes with ribbons "
        "(right). Redraw them at high resolution in the same design, arranged left to right, each centered in its own third "
        "of the canvas with generous space between them. Remove all banner backgrounds, frames, text and buttons; fully "
        "transparent background. " + WSTYLE, True),
    "w_gacha_premium": W("gacha-premium.webp", (47, 732, 355, 885), "1536x768",
        "Redraw this card illustration at high resolution. " + NO_TEXT + "Replace the branded handheld game console with a "
        "generic, unbranded handheld game console with pastel pink and lavender side controllers and no logo on the screen. "
        "Keep the magical pink castle background, crystals, sparkles and gold coins. " + NO_BRAND + " " + WSTYLE),
    "w_gacha_digital": W("gacha-digital.webp", (374, 732, 650, 885), "1536x848",
        "Redraw this card illustration at high resolution. " + NO_TEXT + "Replace the three branded gift cards with three "
        "generic, unbranded gift cards (one white with a red ribbon icon, one blue with a white star, one white with a gold "
        "gift-box icon). Keep the sparkling city background, light rays and the gold coins. " + NO_BRAND + " " + WSTYLE),
    "w_gacha_special": W("gacha-special.webp", (670, 732, 978, 885), "1536x768",
        "Redraw this card illustration at high resolution. " + NO_TEXT + "Keep the open golden treasure chest overflowing with "
        "colorful gems and gold coins, the purple ribbon, the dreamy blue and pink background and sparkles. " + WSTYLE),
    "w_prize_console": W("prize-console.png", (58, 1008, 195, 1095), "1024x768",
        "Draw a generic, unbranded handheld game console in the same position, size and style as the console in this image, "
        "but with pastel pink and mint-green side controllers and a plain dark screen without any logo. " + ISOLATE + NO_BRAND
        + " " + WSTYLE, True),
    "w_prize_phone": W("prize-phone.png", (212, 1008, 350, 1095), "1024x768",
        "Draw a generic, unbranded modern smartphone (front and back view side by side, like in this image) in a soft "
        "lavender color with a single round camera and a plain gradient screen. " + ISOLATE + NO_BRAND + " " + WSTYLE, True),
    "w_card_navy": W("card-navy.png", (365, 1008, 505, 1095), "1024x768",
        "Draw a generic gift card: a rounded rectangle card in deep navy with a glossy gold ribbon and bow across the corner and "
        "small sparkles, slightly tilted, same size and position as the card in this image. " + ISOLATE + NO_BRAND + " "
        + WSTYLE, True),
    "w_card_blue": W("card-blue.png", (519, 1008, 660, 1095), "1024x768",
        "Draw a generic gift card: a rounded rectangle card with a sky-blue to violet gradient and a large glossy white star in "
        "the center, same size and position as the card in this image. " + ISOLATE + NO_BRAND + " " + WSTYLE, True),
    "w_card_green": W("card-green.png", (673, 1008, 814, 1095), "1024x768",
        "Draw a generic gift card: a white rounded rectangle card with a glossy mint-green and yellow gift box icon in the "
        "center, same size and position as the card in this image. " + ISOLATE + NO_BRAND + " " + WSTYLE, True),
    "w_card_coin": W("card-coin.png", (828, 1008, 970, 1095), "1024x768",
        "Draw a generic gift card: a white rounded rectangle card with a light-blue border and a shiny gold coin with a heart "
        "on it in the center, same size and position as the card in this image. " + ISOLATE + NO_BRAND + " " + WSTYLE, True),
    "w_howto_icons": W("howto-icons.png", (60, 1240, 970, 1328), "1536x512",
        "From this row of step cards, keep only the four illustrations: the golden ticket (draw a star on it instead of "
        "letters), the gacha capsule machine with a glass globe and red base, the stacks of gold coins, and the gold gift box "
        "with a magenta ribbon. Redraw them at high resolution in the same design, arranged left to right, each centered in "
        "its own quarter of the canvas. Remove all text, numbers, card backgrounds and frames; fully transparent background. "
        + WSTYLE, True),
    "w_cat_face": W("cat-face.png", (52, 1160, 125, 1215), "1024x768",
        "Redraw this cute calico kitten face icon at high resolution with exactly the same design and expression. " + ISOLATE
        + WSTYLE, True),
    "w_crown": W("crown.png", (44, 680, 108, 724), "1024x768",
        "Redraw this shiny golden crown with a blue gem at high resolution with exactly the same design. " + ISOLATE + WSTYLE,
        True),
    "w_logo_coin": W("logo-coin.png", (84, 6, 128, 54), "1024x1024",
        "Redraw this round shiny gold coin with a small gold crown on top at high resolution with the same design; put a "
        "simple embossed star on the coin face instead of letters. " + ISOLATE + WSTYLE, True),
    "w_footer_cat": W("footer-cat.png", (40, 1345, 215, 1536), "1024x1120",
        "Isolate the cute calico kitten hugging a blue and gold gift box with a big blue ribbon and redraw it at high "
        "resolution with exactly the same design, pose and expression. Remove the flowers and background. " + ISOLATE
        + WSTYLE, True),
    "w_lower_bg": W("lower-bg.webp", (0, 545, 1024, 1536), "1536x1488",
        "Remove every card, panel, banner, button, icon, character, title and piece of text from this web page section and "
        "keep only the decorative background: a soft cream-to-pastel-pink background with gentle sparkles, lush pink and "
        "white flowers with green leaves along the far left and far right edges, and a flower garden with a pale stone path "
        "along the bottom. The center must be a clean, plain soft cream area. No text, no UI, no characters. " + WSTYLE),
})

# 日本の利用者向けに、メインビジュアルの背景を和の風景へ（現在の背景をもとに構図と色調を保つ）
JOBS["w_hero_bg_jp"] = Job(
    out="waku/hero-bg-jp.webp",
    crop=(0, 0, 2048, 1104),
    size="2048x1104",
    ref=ROOT / "tools" / "imagegen" / "work" / "w_hero_bg-output.png",
    prompt=(
        "Redraw this background as a bright, dreamy Japanese spring landscape in the same cute anime mobile-game illustration "
        "style and the same pastel palette (sky blue, sakura pink, cream, soft gold). Keep the same composition and framing: "
        "blue sky with fluffy white clouds at the top, scenery in the middle distance, and soft pink cloud banks and flowers along "
        "the bottom edge. Replace the European castle with a graceful Japanese castle (white walls, pastel blue-green curved roofs "
        "with gold ornaments) on a hill, add a snow-capped Mt. Fuji softly in the far distance, a five-storied pagoda, a vermilion "
        "torii gate, a small arched red bridge over a stream, and many blooming cherry blossom trees with petals drifting in the "
        "air. A few soft paper lanterns. Keep the left half of the image light, airy and low in detail (sky, mist and blossoms) so "
        "text placed there stays readable, and keep the bottom-right area as soft pink clouds and sakura so a character can sit "
        "there. The bottom edge must be pale pink blossoms and cream mist. No people, no characters, no animals, no text, no logos."
    ),
)


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def save_manifest(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2))


def crop_input(job: Job, name: str) -> Path:
    WORK.mkdir(parents=True, exist_ok=True)
    im = Image.open(job.ref).convert("RGB").crop(job.crop)
    # 小さい切り抜きは 2 倍に拡大してから渡す（細部の手がかりを増やす）。大きい画像はそのまま
    if im.width < 1200:
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    p = WORK / f"{name}-input.png"
    im.save(p)
    return p


def run(name: str, job: Job, quality: str, force: bool, manifest: dict) -> None:
    out = OUT / job.out
    # 生成済み（公開用ファイル、または原本と記録がある）なら再生成しない。加工後に公開用ファイルを消した素材も対象
    if not force and (out.exists() or (name in manifest and (WORK / f"{name}-output.png").exists())):
        print(f"[skip] {name}: 生成済み")
        return
    from openai import OpenAI

    client = OpenAI(api_key=api_key())
    src = crop_input(job, name)
    print(f"[gen ] {name}: {MODEL} quality={quality} size={job.size} …", flush=True)
    t0 = time.time()
    with open(src, "rb") as f:
        kwargs = dict(model=MODEL, image=f, prompt=job.prompt, size=job.size, quality=quality, n=1)
        if job.transparent:
            kwargs.update(background="transparent", output_format="png")
        res = client.images.edit(**kwargs)
    dt = time.time() - t0
    raw = base64.b64decode(res.data[0].b64_json)
    out.parent.mkdir(parents=True, exist_ok=True)
    # 生成結果の原本（PNG）を保存し、表示用は WebP に変換
    orig = WORK / f"{name}-output.png"
    orig.write_bytes(raw)
    img = Image.open(io.BytesIO(raw))
    if out.suffix == ".png":
        img.save(out, "PNG", optimize=True)
    else:
        img.save(out, "WEBP", quality=90, method=6)
    u = res.usage
    in_img = getattr(getattr(u, "input_tokens_details", None), "image_tokens", 0) or 0
    in_txt = getattr(getattr(u, "input_tokens_details", None), "text_tokens", 0) or 0
    out_tok = getattr(u, "output_tokens", 0) or 0
    cost = in_img * PRICE_IN_IMAGE + in_txt * PRICE_IN_TEXT + out_tok * PRICE_OUT_IMAGE
    with LOCK:
      manifest[name] = {
        "file": str(out.relative_to(ROOT)),
        "model": MODEL,
        "quality": quality,
        "size": job.size,
        "seconds": round(dt, 1),
        "input_image_tokens": in_img,
        "input_text_tokens": in_txt,
        "output_tokens": out_tok,
        "estimated_cost_usd": round(cost, 4),
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
      save_manifest(manifest)
    print(f"[done] {name}: {out.relative_to(ROOT)}  {img.size}  {dt:.0f}s  tokens in(img {in_img}/txt {in_txt}) out {out_tok}  ≈ ${cost:.3f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--quality", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    a = ap.parse_args()
    manifest = load_manifest()
    if a.list or not a.names:
        total = 0.0
        for n, j in JOBS.items():
            m = manifest.get(n)
            total += m["estimated_cost_usd"] if m else 0
            print(f"{n:16s} {'生成済み' if (OUT / j.out).exists() else '未生成':6s} {j.out}  {('$' + str(m['estimated_cost_usd'])) if m else ''}")
        print(f"累計の概算費用: ${total:.3f}")
        return
    for n in a.names:
        if n not in JOBS:
            raise SystemExit(f"未定義の素材: {n}")

    def one(n: str) -> None:
        try:
            run(n, JOBS[n], a.quality, a.force, manifest)
        except Exception as e:  # 失敗の原因を表示（キーは含まれない）
            print(f"[fail] {n}: {type(e).__name__}: {str(e)[:400]}", flush=True)

    # 同時に 3 件まで（レート制限と費用の見通しを保つ）
    with ThreadPoolExecutor(max_workers=3) as ex:
        list(ex.map(one, a.names))


if __name__ == "__main__":
    main()
