import { addDays, isoDate } from "../../lib/format";

export interface DateRange {
  from: string;
  to: string;
}

type Preset = "this_month" | "last_30" | "last_3_months" | "this_year" | "last_12_months" | "custom";

export function presetRange(preset: Exclude<Preset, "custom">, today = isoDate()): DateRange {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "this_month":
      return { from: isoDate(new Date(y, m - 1, 1)), to: today };
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "last_3_months":
      return { from: isoDate(new Date(y, m - 3, 1)), to: today };
    case "this_year":
      return { from: `${y}-01-01`, to: today };
    case "last_12_months":
      return { from: isoDate(new Date(y, m - 12, 1)), to: today };
  }
}

const PRESETS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_year", label: "This year" },
  { id: "last_12_months", label: "Last 12 months" },
];

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const active = PRESETS.find((p) => {
    const r = presetRange(p.id);
    return r.from === value.from && r.to === value.to;
  })?.id;
  const year = new Date().getFullYear();

  return (
    <div className="date-range">
      <select
        aria-label="Date range preset"
        value={active ?? "custom"}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("year-")) {
            const yy = Number(v.slice(5));
            onChange({ from: `${yy}-01-01`, to: yy === year ? isoDate() : `${yy}-12-31` });
          } else if (v !== "custom") onChange(presetRange(v as Exclude<Preset, "custom">));
        }}
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        {[year - 1, year - 2].map((yy) => (
          <option key={yy} value={`year-${yy}`}>
            Year {yy}
          </option>
        ))}
        <option value="custom">Custom range</option>
      </select>
      <input type="date" aria-label="From date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
      <span className="muted small">to</span>
      <input type="date" aria-label="To date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
    </div>
  );
}
