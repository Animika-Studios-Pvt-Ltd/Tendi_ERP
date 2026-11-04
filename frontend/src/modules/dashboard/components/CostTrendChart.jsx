import { TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { axisProps, CHART_COLORS, gridProps } from '@/components/charts/chartTheme';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

const crore = (value) => `₹${value.toFixed(1)} Cr`;

export default function CostTrendChart({ data }) {
  const planned = data.reduce((sum, d) => sum + d.planned, 0);
  const actual = data.reduce((sum, d) => sum + d.actual, 0);
  const overrun = ((actual - planned) / planned) * 100;

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={TrendingUp}
        title="Monthly spend vs plan"
        description={`Last 6 months: ${crore(actual)} spent against ${crore(planned)} planned (${overrun > 0 ? '+' : ''}${overrun.toFixed(1)}%).`}
      />
      <CardBody className="flex-1">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => `${v}`} width={40} />
              <Tooltip content={<ChartTooltip formatter={crore} />} cursor={{ fill: CHART_COLORS.grid, opacity: 0.5 }} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: CHART_COLORS.axis }} />
              <Bar dataKey="planned" name="Planned" fill={CHART_COLORS.muted} radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
              <Line dataKey="actual" name="Actual trend" type="monotone" stroke={CHART_COLORS.accent} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS.accent }} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-2xs text-muted">Values in ₹ crore.</p>
      </CardBody>
    </Card>
  );
}
