import React, { useMemo } from 'react';
import { AnalyticsData, TimeSeriesPoint, FunnelStep, DateRange } from '@/types';
import { useAnalytics } from '@/hooks/useAnalytics';

interface ChartBarProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

function ChartBar({ label, value, maxValue, color }: ChartBarProps) {
  const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="chart-bar" title={`${label}: ${value}`}>
      <div className="chart-bar__fill" style={{ height: `${height}%`, backgroundColor: color }} />
      <span className="chart-bar__label">{label}</span>
    </div>
  );
}

function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  return (
    <div className="funnel-chart">
      {steps.map((step, i) => (
        <div key={step.stage} className="funnel-chart__step" style={{ width: `${100 - i * 15}%` }}>
          <span className="funnel-chart__stage">{step.stage}</span>
          <span className="funnel-chart__count">{step.count.toLocaleString()}</span>
          <span className="funnel-chart__rate">{(step.conversionRate * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** Analytics dashboard with revenue chart, order trends, top products, and conversion funnel */
export function AnalyticsChart() {
  const { data, dateRange, setDateRange, loading } = useAnalytics();

  const revenueMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.revenue.map((p) => p.value), 1);
  }, [data]);

  const ordersMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.orders.map((p) => p.value), 1);
  }, [data]);

  const handlePresetChange = (preset: DateRange['preset']) => {
    const end = new Date().toISOString().split('T')[0];
    const daysMap: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
    const days = daysMap[preset ?? '30d'] ?? 30;
    const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    setDateRange({ start, end, preset });
  };

  if (loading || !data) return <div className="analytics__loading">Loading analytics...</div>;

  return (
    <div className="analytics">
      <div className="analytics__header">
        <h2>Analytics Overview</h2>
        <div className="analytics__date-presets">
          {(['7d', '30d', '90d', '12m'] as const).map((p) => (
            <button key={p} className={dateRange.preset === p ? 'active' : ''} onClick={() => handlePresetChange(p)}>{p}</button>
          ))}
        </div>
      </div>
      <section className="analytics__revenue">
        <h3>Revenue Trend</h3>
        <div className="chart-container">
          {data.revenue.map((point: TimeSeriesPoint) => (
            <ChartBar key={point.date} label={point.date.slice(5)} value={point.value} maxValue={revenueMax} color="#3b82f6" />
          ))}
        </div>
      </section>
      <section className="analytics__orders">
        <h3>Order Volume</h3>
        <div className="chart-container">
          {data.orders.map((point: TimeSeriesPoint) => (
            <ChartBar key={point.date} label={point.date.slice(5)} value={point.value} maxValue={ordersMax} color="#10b981" />
          ))}
        </div>
      </section>
      <section className="analytics__top-products">
        <h3>Top Products</h3>
        <ol>{data.topProducts.map((p) => (
          <li key={p.productId}>{p.title} — {p.unitsSold} sold — {formatCompactCurrency(p.revenue)}</li>
        ))}</ol>
      </section>
      <section className="analytics__funnel">
        <h3>Conversion Funnel</h3>
        <FunnelChart steps={data.conversionFunnel} />
      </section>
    </div>
  );
}
