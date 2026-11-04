/** Recharts custom tooltip: <Tooltip content={<ChartTooltip formatter={fn} />} /> */
export default function ChartTooltip({ active, payload, label, formatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-raised">
      {label != null && <p className="mb-1 font-semibold text-ink">{label}</p>}
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: entry.color }} aria-hidden="true" />
            <span>{entry.name}</span>
            <span className="tabular ml-auto pl-3 font-medium text-ink">{formatter(entry.value, entry.dataKey)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
