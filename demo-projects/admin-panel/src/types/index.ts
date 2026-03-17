/** Admin user with role and session metadata */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  avatarUrl?: string;
  lastLoginAt: string;
  isBanned: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export type AdminRole = 'admin' | 'manager' | 'support';

/** Compact order representation for table views */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  shippingMethod?: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** Product form fields for create/edit */
export interface ProductFormData {
  title: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  images: ProductImage[];
  variants: ProductVariant[];
  seoTitle?: string;
  seoDescription?: string;
  tags: string[];
  isPublished: boolean;
  categoryId: string;
}

export interface ProductImage {
  url: string;
  alt: string;
  position: number;
}

export interface ProductVariant {
  id?: string;
  name: string;
  sku: string;
  price: number;
  inventory: number;
  options: Record<string, string>;
}

/** Analytics aggregated data for dashboard charts */
export interface AnalyticsData {
  revenue: TimeSeriesPoint[];
  orders: TimeSeriesPoint[];
  topProducts: TopProduct[];
  conversionFunnel: FunnelStep[];
  summaryMetrics: SummaryMetrics;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface TopProduct {
  productId: string;
  title: string;
  unitsSold: number;
  revenue: number;
}

export interface FunnelStep {
  stage: string;
  count: number;
  conversionRate: number;
}

export interface SummaryMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  newCustomers: number;
  returningCustomers: number;
}

export interface DateRange {
  start: string;
  end: string;
  preset?: 'today' | '7d' | '30d' | '90d' | '12m' | 'custom';
}

/** Configuration for CSV data export */
export interface ExportConfig {
  entity: 'orders' | 'products' | 'users';
  columns: string[];
  filters?: Record<string, string>;
  dateRange?: DateRange;
  includeHeaders: boolean;
  delimiter: ',' | ';' | '\t';
}
