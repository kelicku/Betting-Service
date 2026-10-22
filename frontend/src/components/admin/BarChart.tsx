"use client";

import { useState } from "react";

/**
 * 管理画面用の棒グラフ（1〜2 系列）。
 * 配色は検証済み（暗色背景 #0F1433 に対し明度帯・彩度・色覚多様性での識別・コントラストを満たす）。
 * 系列 2 つ以上では凡例を常に表示し、ホバーで値を表示、表形式でも確認できる。
 */
export const SERIES_COLORS = ["#B9852B", "#9B7BEA"];

type Series = { key: string; label: string };

export default function BarChart({
  title,
  data,
  series,
  xKey = "date",
  height = 180,
}: {
  title: string;
  data: Record<string, number | string>[];
  series: Series[];
  xKey?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const W = 640;
  const padL = 36;
  const padB = 22;
  const plotW = W - padL - 8;
  const plotH = height - padB - 8;
  const band = plotW / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.max(2, (band * 0.7 - gap * (series.length - 1)) / series.length);
  const label = (d: Record<string, number | string>) => String(d[xKey]).slice(5).replace("-", "/");

  return (
    <figure className="glass p-4 sm:p-5">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-serif font-bold text-gold-light">{title}</span>
        <span className="flex items-center gap-3 text-xs text-moon/70">
          {series.length > 1 &&
            series.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                {s.label}
              </span>
            ))}
          <button onClick={() => setTable((v) => !v)} className="rounded border border-veil/10 px-2 py-0.5 hover:border-gold/40">
            {table ? "グラフ" : "表"}
          </button>
        </span>
      </figcaption>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>日付</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={String(d[xKey])}>
                  <td>{String(d[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="text-right tabular-nums">{Number(d[s.key]).toLocaleString("ja-JP")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((f) => {
              const y = 8 + plotH * (1 - f);
              return (
                <g key={f}>
                  <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
                  <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="rgba(247,244,255,0.45)">
                    {Math.round(top * f).toLocaleString("ja-JP")}
                  </text>
                </g>
              );
            })}
            {data.map((d, i) => {
              const x0 = padL + band * i + (band - (barW * series.length + gap * (series.length - 1))) / 2;
              return (
                <g key={i}>
                  {series.map((s, j) => {
                    const v = Number(d[s.key]) || 0;
                    const h = (v / top) * plotH;
                    const x = x0 + j * (barW + gap);
                    const y = 8 + plotH - h;
                    const r = Math.min(4, barW / 2, h);
                    return (
                      <path
                        key={s.key}
                        d={h <= 0 ? "" : `M${x},${8 + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${8 + plotH} Z`}
                        fill={SERIES_COLORS[j]}
                        opacity={hover == null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                  {(i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
                    <text x={padL + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="rgba(247,244,255,0.45)">
                      {label(d)}
                    </text>
                  )}
                  <rect x={padL + band * i} y={0} width={band} height={height - padB} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
                </g>
              );
            })}
            <line x1={padL} x2={W - 8} y1={8 + plotH} y2={8 + plotH} stroke="rgba(255,255,255,0.2)" />
          </svg>
          {hover != null && data[hover] && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-gold/30 bg-night-900/95 px-3 py-2 text-xs shadow-lg"
              style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%` }}
            >
              <p className="mb-1 text-moon/60">{String(data[hover][xKey])}</p>
              {series.map((s, j) => (
                <p key={s.key} className="flex items-center gap-1.5 text-moon">
                  <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLORS[j] }} />
                  {s.label}：<span className="tabular-nums">{Number(data[hover][s.key]).toLocaleString("ja-JP")}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
