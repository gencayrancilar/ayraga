import { scoreBand } from "@/lib/format";

/** AYRA Skoru göstergesi — yay şeklinde, tek renk, süs yok. */
export function ScoreDial({ score, size = 132 }: { score: number; size?: number }) {
  const band = scoreBand(score);
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius; // yarım daire
  const progress = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`} role="img"
           aria-label={`AYRA skoru ${score} / 100 — ${band.label}`}>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke="var(--color-surface-sunken)" strokeWidth={stroke} strokeLinecap="round"
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke={band.color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
        />
      </svg>
      <div className="-mt-8 text-center">
        <p className="text-3xl font-semibold tabular-nums leading-none text-ink-900">{score}</p>
        <p className="mt-1 text-2xs font-medium" style={{ color: band.color }}>{band.label}</p>
      </div>
    </div>
  );
}

export function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`${score} / 100`}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${score}%`, background: color }} />
    </div>
  );
}
