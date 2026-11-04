import { ShieldCheck } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

export default function SafetySummary({ safety }) {
  const stats = [
    { label: 'Open non-conformances', value: safety.openNonConformances },
    { label: 'Inspections this week', value: safety.inspectionsThisWeek },
    { label: 'Near misses this month', value: safety.nearMissesThisMonth },
  ];

  return (
    <Card>
      <CardHeader icon={ShieldCheck} title="Quality & safety" description="Across all active sites." />
      <CardBody>
        <div className="rounded-md bg-navy-900 px-4 py-4 text-white">
          <p className="tabular font-display text-4xl leading-none font-bold" style={{ fontVariationSettings: "'wdth' 80" }}>
            {safety.daysWithoutLostTime}
          </p>
          <p className="mt-1.5 text-xs text-navy-200">days without a lost-time incident</p>
        </div>
        <dl className="mt-4 divide-y divide-line">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between py-2 text-sm">
              <dt className="text-muted">{stat.label}</dt>
              <dd className="tabular font-semibold text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
