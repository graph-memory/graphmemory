import { ExportConfig, DateRange } from '@/types';
import { apiClient } from './api-client';

interface ExportableRow {
  [key: string]: string | number | boolean | null;
}

/** Escapes a CSV field value, wrapping in quotes if it contains the delimiter */
function escapeField(value: unknown, delimiter: string): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts rows to CSV string with configurable delimiter */
function rowsToCsv(rows: ExportableRow[], columns: string[], delimiter: string, includeHeaders: boolean): string {
  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(columns.map((c) => escapeField(c, delimiter)).join(delimiter));
  }
  for (const row of rows) {
    const fields = columns.map((col) => escapeField(row[col], delimiter));
    lines.push(fields.join(delimiter));
  }
  return lines.join('\n');
}

/** Triggers a browser download of a CSV string */
function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Fetches data in pages and streams CSV generation for large datasets */
async function fetchAllPages(entity: string, filters: Record<string, string>, dateRange?: DateRange): Promise<ExportableRow[]> {
  const allRows: ExportableRow[] = [];
  let page = 1;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      ...filters,
    });
    if (dateRange) {
      params.set('startDate', dateRange.start);
      params.set('endDate', dateRange.end);
    }
    const res = await apiClient.get<{ items: ExportableRow[]; total: number }>(
      `/${entity}?${params.toString()}`,
    );
    allRows.push(...res.items);
    hasMore = allRows.length < res.total;
    page++;
  }
  return allRows;
}

/** Exports entity data (orders, products, users) to CSV with streaming pagination */
export async function exportToCsv(config: ExportConfig): Promise<void> {
  const rows = await fetchAllPages(config.entity, config.filters ?? {}, config.dateRange);

  const csv = rowsToCsv(rows, config.columns, config.delimiter, config.includeHeaders);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${config.entity}-export-${timestamp}.csv`;

  downloadCsv(csv, filename);
}

/** Predefined export configurations for common use cases */
export const EXPORT_PRESETS: Record<string, ExportConfig> = {
  allOrders: {
    entity: 'orders',
    columns: ['orderNumber', 'customerName', 'customerEmail', 'status', 'totalAmount', 'currency', 'createdAt'],
    includeHeaders: true,
    delimiter: ',',
  },
  allProducts: {
    entity: 'products',
    columns: ['title', 'sku', 'price', 'inventory', 'isPublished', 'categoryId', 'createdAt'],
    includeHeaders: true,
    delimiter: ',',
  },
  allUsers: {
    entity: 'users',
    columns: ['displayName', 'email', 'role', 'isBanned', 'twoFactorEnabled', 'lastLoginAt', 'createdAt'],
    includeHeaders: true,
    delimiter: ',',
  },
};
