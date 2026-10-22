/**
 * 「人気の交換先」のロゴ（参考画像の再現）。画像ではなく SVG で描画する。
 * Apple・PlayStation の記号の形は Simple Icons（CC0）による。各社のロゴは商標のため、公開前に各社の許諾を得ること。
 */

const APPLE = "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";
const PS = "M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z";

export function AmazonLogo() {
  return (
    <svg viewBox="0 0 120 40" className="h-[38%] w-auto" role="img" aria-label="amazon">
      <text x="60" y="24" textAnchor="middle" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="27" letterSpacing="-1">amazon</text>
      {/* a から z へ向かう笑顔の矢印 */}
      <path d="M24 29.5c14 7.5 40 8 60-1.2" fill="none" stroke="#ff9900" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M78.5 25.6l7.8 1.9-2.4 7.4" fill="none" stroke="#ff9900" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[64%] w-auto" role="img" aria-label="Apple">
      <path d={APPLE} fill="#fff" />
    </svg>
  );
}

export function GooglePlayLogo() {
  return (
    <svg viewBox="0 0 24 26" className="h-[56%] w-auto" role="img" aria-label="Google Play">
      <path d="M1.2 1.1L13.7 13 1.2 24.9c-.5-.3-.8-.9-.8-1.6V2.7c0-.7.3-1.3.8-1.6z" fill="#2196f3" />
      <path d="M1.2 1.1c.5-.3 1.2-.3 1.9.1l14 8.1-3.4 3.7z" fill="#34a853" />
      <path d="M1.2 24.9L13.7 13l3.4 3.7-14 8.1c-.7.4-1.4.4-1.9.1z" fill="#ea4335" />
      <path d="M17.1 9.3l4.2 2.4c1 .6 1 2 0 2.6l-4.2 2.4L13.7 13z" fill="#fbbc04" />
    </svg>
  );
}

export function DigicoLogo() {
  return (
    <svg viewBox="0 0 140 44" className="h-[44%] w-auto" role="img" aria-label="デジコ">
      <circle cx="22" cy="22" r="19" fill="#1c9be6" />
      <path d="M15.5 11.5h8.6a7.4 7.4 0 010 14.8h-3.8v7.2h-4.8zm4.8 4.3v6.2h3.4a3.1 3.1 0 000-6.2z" fill="#fff" />
      <text x="50" y="32" fill="#1d2433" fontFamily="var(--font-round), sans-serif" fontWeight="900" fontSize="28" letterSpacing="1">デジコ</text>
    </svg>
  );
}

export function EshopLogo() {
  return (
    <svg viewBox="0 0 150 30" className="h-[27%] w-auto max-w-[90%]" role="img" aria-label="Nintendo eShop">
      {/* ショップの袋（白い丸の中） */}
      <circle cx="13" cy="15" r="11.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M8 13.5h10v6.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 018 20zM10.5 13.5v-2a2.5 2.5 0 015 0v2" fill="#fff" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      <text x="30" y="21" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="15.5" letterSpacing="-0.3">
        Nintendo <tspan fontStyle="italic" fontWeight="400">e</tspan>Shop
      </text>
    </svg>
  );
}

export function PlayStationStoreLogo() {
  return (
    <span className="flex h-full flex-col items-center justify-center gap-[6%]" role="img" aria-label="PlayStation Store">
      <svg viewBox="0 0 32 34" className="h-[44%] w-auto" aria-hidden>
        {/* 袋の取っ手と本体 */}
        <path d="M11 9V7.5a5 5 0 0110 0V9" fill="none" stroke="#7fc4ff" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M5 9h22l-1.4 21.2A2.5 2.5 0 0123.1 32.5H8.9a2.5 2.5 0 01-2.5-2.3z" fill="#3fa2ff" />
        <svg x="7.5" y="12" width="17" height="17" viewBox="0 0 24 24">
          <path d={PS} fill="#fff" />
        </svg>
      </svg>
      <span className="font-['Arial',sans-serif] text-[0.55rem] font-bold tracking-[-0.01em] text-white lg:text-[0.8rem]">PlayStation Store</span>
    </span>
  );
}
