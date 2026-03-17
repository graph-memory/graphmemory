import React, { useState, useCallback } from 'react';
import { OrderSummary, OrderStatus } from '@/types';
import { useOrders } from '@/hooks/useOrders';

type SortField = 'orderNumber' | 'totalAmount' | 'createdAt' | 'status';
type SortDirection = 'asc' | 'desc';

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
  refunded: '#6b7280',
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className="status-badge" style={{ backgroundColor: STATUS_COLORS[status] }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/** Sortable, filterable order data table with bulk actions and pagination */
export function OrderTable() {
  const { orders, total, page, setPage, statusFilter, setStatusFilter, loading } = useOrders();
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const sortedOrders = [...orders].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'totalAmount') return (a.totalAmount - b.totalAmount) * mul;
    return String(a[sortField]).localeCompare(String(b[sortField])) * mul;
  });

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="order-table">
      <div className="order-table__toolbar">
        <select value={statusFilter ?? ''} onChange={(e) => setStatusFilter(e.target.value as OrderStatus || undefined)}>
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {selected.size > 0 && (
          <button className="order-table__bulk-action" onClick={() => console.log('Bulk action on', [...selected])}>
            Bulk Update ({selected.size})
          </button>
        )}
      </div>
      {loading ? <p>Loading orders...</p> : (
        <table className="order-table__grid">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleSelectAll} /></th>
              {(['orderNumber', 'totalAmount', 'status', 'createdAt'] as SortField[]).map((f) => (
                <th key={f} onClick={() => toggleSort(f)} className="order-table__sortable">
                  {f} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              <th>Customer</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.map((order: OrderSummary) => (
              <tr key={order.id} className={selected.has(order.id) ? 'selected' : ''}>
                <td><input type="checkbox" checked={selected.has(order.id)} onChange={() => toggleSelect(order.id)} /></td>
                <td>{order.orderNumber}</td>
                <td>{formatCurrency(order.totalAmount, order.currency)}</td>
                <td><StatusBadge status={order.status} /></td>
                <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                <td>{order.customerName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="order-table__pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
