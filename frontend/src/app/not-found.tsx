import Image from "next/image";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 py-28 text-center">
      <Image src="/images/waku/cat-face.webp" alt="" width={112} height={84} className="h-auto w-28" />
      <p className="font-round text-6xl font-black text-gold/40">404</p>
      <h1 className="font-round text-xl font-bold text-moon">お探しのページが見つかりませんでした。</h1>
      <p className="text-sm text-moon/60">URL が変わったか、ページが削除された可能性があります。</p>
      <Button href="/">トップへ戻る</Button>
    </div>
  );
}
