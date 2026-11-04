import { Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { axisProps, CHART_COLORS, gridProps } from '@/components/charts/chartTheme';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/utils/format';

export default function AttendanceChart({ data }) {
  return (
    <Card>
      <CardHeader icon={Users} title="Labour on site today" description="Present vs planned headcount by site." />
      <CardBody>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={1} barCategoryGap="22%">
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} tickCount={5} domain={[0, (max) => Math.ceil(max / 100) * 100]} />
              <YAxis type="category" dataKey="site" {...axisProps} width={76} />
              <Tooltip content={<ChartTooltip formatter={formatNumber} />} cursor={{ fill: CHART_COLORS.grid, opacity: 0.5 }} />
              <Bar dataKey="planned" name="Planned" fill={CHART_COLORS.muted} radius={[0, 2, 2, 0]} />
              <Bar dataKey="present" name="Present" fill={CHART_COLORS.accent} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}
