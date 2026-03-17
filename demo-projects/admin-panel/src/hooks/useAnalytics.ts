import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnalyticsData, DateRange, TimeSeriesPoint } from '@/types';
import { apiClient } from '@/services/api-client';

interface UseAnalyticsReturn {
  data: AnalyticsData | null;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  loading: boolean;
  error: string | null;
  revenueGrowth: number | null;
  orderGrowth: number | null;
}

function computeGrowthRate(series: TimeSeriesPoint[]): number | null {
  if (series.length < 2) return null;
  const midpoint = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, midpoint).reduce((sum, p) => sum + p.value, 0);
  const secondHalf = series.slice(midpoint).reduce((sum, p) => sum + p.value, 0);
  if (firstHalf === 0) return null;
  return ((secondHalf - firstHalf) / firstHalf) * 100;
}

function defaultDateRange(): DateRange {
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  return { start, end, preset: '30d' };
}

/** Fetches analytics data with date range selection and computed growth metrics */
export function useAnalytics(): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      const result = await apiClient.get<AnalyticsData>(
        `/analytics?${params.toString()}`,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const revenueGrowth = useMemo(
    () => (data ? computeGrowthRate(data.revenue) : null),
    [data],
  );

  const orderGrowth = useMemo(
    () => (data ? computeGrowthRate(data.orders) : null),
    [data],
  );

  return {
    data,
    dateRange,
    setDateRange,
    loading,
    error,
    revenueGrowth,
    orderGrowth,
  };
}
