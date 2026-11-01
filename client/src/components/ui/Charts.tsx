import { formatCompactMoney } from "../../lib/format";

interface Point {
  label: string;
  value: number;
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

/** Accessible vertical bar chart rendered with CSS (no chart library). */
export function BarChart({ data, money, emptyText = "No data for this period" }: { data: Point[]; money?: boolean; emptyText?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max === 0) return <p className="muted small chart-empty">{emptyText}</p>;
  const fmt = (v: number) => (money ? formatCompactMoney(v) : String(v));
  return (
    <div className="bar-chart" role="img" aria-label={data.map((d) => `${d.label}: ${fmt(d.value)}`).join(", ")}>
      {data.map((d) => (
        <div className="bar-col" key={d.label}>
          <span className="bar-value">{d.value > 0 ? fmt(d.value) : ""}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function monthPoints(data: { month: string; value: number }[] | null | undefined): Point[] {
  return (data ?? []).map((d) => ({ label: monthLabel(d.month), value: Number(d.value) }));
}

/** Horizontal bars for category comparisons. */
export function HBarList({ data, money }: { data: Point[]; money?: boolean }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0 || max === 0) return <p className="muted small chart-empty">No data for this period</p>;
  return (
    <ul className="hbar-list">
      {data.map((d) => (
        <li key={d.label}>
          <div className="hbar-head">
            <span>{d.label}</span>
            <strong>{money ? formatCompactMoney(d.value) : d.value}</strong>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DONUT_COLORS = ["var(--c-success)", "var(--c-warning)", "var(--c-danger)", "var(--c-muted-strong)", "var(--c-info)"];

export function Donut({ data, centerLabel }: { data: Point[]; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="muted small chart-empty">No data yet</p>;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--c-border)" strokeWidth="18" />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const el = (
            <circle
              key={d.label}
              cx="70" cy="70" r={r} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="18"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          );
          offset += len;
          return el;
        })}
        {centerLabel && (
          <text x="70" y="75" textAnchor="middle" className="donut-center">
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span className="legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            {d.label} <strong>{d.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
