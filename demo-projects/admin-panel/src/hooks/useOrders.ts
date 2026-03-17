import { useState, useEffect, useCallback, useRef } from 'react';
import { OrderSummary, OrderStatus, DateRange } from '@/types';
import { apiClient } from '@/services/api-client';

interface UseOrdersOptions {
  pageSize?: number;
  pollInterval?: number;
}

interface UseOrdersReturn {
  orders: OrderSummary[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  statusFilter: OrderStatus | undefined;
  setStatusFilter: (status: OrderStatus | undefined) => void;
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Fetches paginated orders with status/date filters and real-time polling */
export function useOrders(options: UseOrdersOptions = {}): UseOrdersReturn {
  const { pageSize = 20, pollInterval = 15000 } = options;
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);
      if (dateRange) {
        params.set('startDate', dateRange.start);
        params.set('endDate', dateRange.end);
      }
      const res = await apiClient.get<{ items: OrderSummary[]; total: number }>(
        `/orders?${params.toString()}`,
      );
      setOrders(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, dateRange]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time polling for order updates
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchOrders(true);
    }, pollInterval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchOrders, pollInterval]);

  const refresh = useCallback(() => {
    fetchOrders();
  }, [fetchOrders]);

  return {
    orders,
    total,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    dateRange,
    setDateRange,
    loading,
    error,
    refresh,
  };
}
