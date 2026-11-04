import { Card } from '@/components/ui/Card';

export default function KpiCard({ icon: Icon, label, value, children }) {
  return (
    <Card className="flex flex-col px-5 py-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={15} aria-hidden="true" className="text-navy-500" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="tabular mt-2 font-display text-[1.75rem] leading-none font-semibold text-navy-900" style={{ fontVariationSettings: "'wdth' 85" }}>
        {value}
      </p>
      {children && <div className="mt-3 text-xs text-muted">{children}</div>}
    </Card>
  );
}
