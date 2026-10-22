import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 色はテーマ変数（globals.css）。既定は明るいテーマ、.theme-night の中だけ従来の夜空の配色になる
      colors: {
        night: { DEFAULT: v("night"), 900: v("night-900"), 800: v("night-800"), 700: v("night-700") },
        royal: { DEFAULT: v("royal"), 600: v("royal-600"), 500: v("royal-500") },
        amethyst: { DEFAULT: v("amethyst"), 300: v("amethyst-300"), 200: v("amethyst-200") },
        gold: { DEFAULT: v("gold"), 300: v("gold-300"), light: v("gold-light"), deep: v("gold-deep") },
        moon: v("moon"),
        aurora: { DEFAULT: v("aurora"), 300: v("aurora-300") },
        blush: v("blush"),
        // 背景にうっすら重ねる色（明るいテーマでは紺、夜空のテーマでは白）
        veil: v("veil"),
      },
      fontFamily: {
        // 見出しもトップページと同じ丸ゴシックにそろえる
        serif: ["var(--font-round)", "var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-round)", "var(--font-sans)", "system-ui", "sans-serif"],
        round: ["var(--font-round)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 6px 20px -6px rgba(255,80,140,0.45)",
        "glow-lg": "0 10px 32px -8px rgba(255,80,140,0.55)",
        "glow-purple": "0 0 32px rgba(118,84,200,0.5)",
        inner: "inset 0 1px 0 rgba(255,255,255,0.08)",
      },
      keyframes: {
        twinkle: { "0%,100%": { opacity: "0.3" }, "50%": { opacity: "1" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        twinkle: "twinkle 3s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin-slow 40s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
