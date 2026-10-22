import "server-only";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://localhost:8300";

/** サーバーコンポーネントから公開 API を取得する（Cookie を使わない公開情報のみ）。 */
export async function serverGet<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND}/api${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
