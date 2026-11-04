/** Shared Recharts styling so every chart reads as part of one system. */
export const CHART_COLORS = {
  primary: '#14243A',
  accent: '#F59E0B',
  secondary: '#7890AD',
  muted: '#CDD7E3',
  success: '#16A34A',
  danger: '#DC2626',
  grid: '#E3E8EF',
  axis: '#64748B',
};

export const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.axis, fontSize: 12 },
  tickLine: false,
  axisLine: false,
};

export const gridProps = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: '0',
  vertical: false,
};
