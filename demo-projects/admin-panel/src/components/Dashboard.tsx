import React, { useEffect, useState } from 'react';
import { SummaryMetrics } from '@/types';
import { apiClient } from '@/services/api-client';

interface StatCardProps {
  label: string;
  value: string | number;
  change: number;
  icon: string;
}

function StatCard({ label, value, change, icon }: StatCardProps) {
  const trend = change >= 0 ? 'positive' : 'negative';
  return (
    <div className={`stat-card stat-card--${trend}`}>
      <span className="stat-card__icon">{icon}</span>
      <div className="stat-card__content">
        <h3 className="stat-card__value">{value}</h3>
        <p className="stat-card__label">{label}</p>
        <span className="stat-card__change">
          {change >= 0 ? '+' : ''}{change}% vs last period
        </span>
      </div>
    </div>
  );
}

interface RecentActivity {
  id: string;
  type: 'order' | 'user' | 'product';
  message: string;
  timestamp: string;
}

/** Main admin dashboard with overview stats and recent activity feed */
export function Dashboard() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [metricsRes, activityRes] = await Promise.all([
          apiClient.get<SummaryMetrics>('/analytics/summary'),
          apiClient.get<RecentActivity[]>('/activity/recent?limit=10'),
        ]);
        setMetrics(metricsRes);
        setActivity(activityRes);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading || !metrics) {
    return <div className="dashboard__loading">Loading dashboard...</div>;
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="dashboard">
      <h1 className="dashboard__title">ShopFlow Admin Dashboard</h1>
      <div className="dashboard__stats-grid">
        <StatCard label="Total Revenue" value={formatCurrency(metrics.totalRevenue)} change={12.5} icon="$" />
        <StatCard label="Orders" value={metrics.totalOrders} change={8.3} icon="#" />
        <StatCard label="Avg Order Value" value={formatCurrency(metrics.averageOrderValue)} change={-2.1} icon="~" />
        <StatCard label="New Customers" value={metrics.newCustomers} change={15.7} icon="+" />
      </div>
      <section className="dashboard__activity">
        <h2>Recent Activity</h2>
        <ul className="activity-feed">
          {activity.map((item) => (
            <li key={item.id} className={`activity-feed__item activity-feed__item--${item.type}`}>
              <span className="activity-feed__message">{item.message}</span>
              <time className="activity-feed__time">{new Date(item.timestamp).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
