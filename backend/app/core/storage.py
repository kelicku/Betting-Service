"""画像などのファイル保存。開発はローカルディスク、本番は S3 互換オブジェクトストレージ。"""

import io
import uuid
from pathlib import Path

from PIL import Image

from app.core.config import settings
from app.core.errors import AppError

ALLOWED_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp", "GIF": "gif"}
MAX_BYTES = 5 * 1024 * 1024
MAX_EDGE = 1600


def _normalize_image(data: bytes) -> tuple[bytes, str, str]:
    """画像として正しく読めるか検証し、大きすぎる画像は縮小して WebP に変換する。"""
    if len(data) > MAX_BYTES:
        raise AppError("file_too_large", "画像サイズは5MB以下にしてください。")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
    except Exception as e:
        raise AppError("invalid_image", "画像ファイルを読み込めませんでした。") from e
    if img.format not in ALLOWED_FORMATS:
        raise AppError("invalid_image", "PNG・JPEG・WebP・GIF 形式の画像を指定してください。")
    if img.format == "GIF":
        return data, "gif", "image/gif"
    img.thumbnail((MAX_EDGE, MAX_EDGE))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    out = io.BytesIO()
    img.save(out, format="WEBP", quality=86, method=4)  # メタデータ（EXIF 位置情報等）は除去される
    return out.getvalue(), "webp", "image/webp"


MAX_VIDEO_BYTES = 30 * 1024 * 1024


def is_mp4(data: bytes) -> bool:
    """MP4（ISO base media）の先頭の「ftyp」ボックスで判定する。"""
    return len(data) > 12 and data[4:8] == b"ftyp"


def save_video(data: bytes, folder: str = "effects") -> str:
    """演出動画（MP4）を保存する。変換はせず、そのまま保存する（H.264 推奨）。"""
    if len(data) > MAX_VIDEO_BYTES:
        raise AppError("file_too_large", "動画のサイズは30MB以下にしてください（10MB以下を推奨）。")
    if not is_mp4(data):
        raise AppError("invalid_video", "MP4 形式の動画を指定してください。")
    return _store(data, f"{folder}/{uuid.uuid4().hex}.mp4", "video/mp4")


def save_image(data: bytes, folder: str = "prizes") -> str:
    body, ext, content_type = _normalize_image(data)
    return _store(body, f"{folder}/{uuid.uuid4().hex}.{ext}", content_type)


def _store(body: bytes, key: str, content_type: str) -> str:
    if settings.storage_backend == "s3":
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
        s3.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        base = settings.s3_public_base_url or f"{settings.s3_endpoint_url}/{settings.s3_bucket}"
        return f"{base.rstrip('/')}/{key}"
    path = Path(settings.storage_local_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return f"{settings.storage_public_base_url.rstrip('/')}/{key}"
