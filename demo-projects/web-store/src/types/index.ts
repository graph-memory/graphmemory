/**
 * Core domain types for the ShopFlow Web Store.
 *
 * All API responses and internal state objects derive from these interfaces.
 * Types are organized by domain: products, cart, users, orders, and search.
 * @module types
 */

/** Supported payment methods for checkout */
export type PaymentMethod = 'credit_card' | 'paypal' | 'apple_pay' | 'google_pay';

/** Sequential steps in the checkout flow */
export type CheckoutStep = 'address' | 'shipping' | 'payment' | 'confirmation';

/** Product availability status from the catalog API */
export type ProductStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'preorder';

/** A product listing from the catalog service */
export interface Product {
  id: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  images: ProductImage[];
  category: string;
  tags: string[];
  rating: number;
  reviewCount: number;
  status: ProductStatus;
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

/** A single product image with alt text for accessibility */
export interface ProductImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

/** A product variant (size, color, etc.) */
export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  available: boolean;
  attributes: Record<string, string>;
}

/** An item in the shopping cart, referencing a product and optional variant */
export interface CartItem {
  productId: string;
  variantId?: string;
  title: string;
  price: number;
  quantity: number;
  image: string;
  maxQuantity: number;
}

/** Authenticated user profile */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  addresses: ShippingAddress[];
  preferences: UserPreferences;
  createdAt: string;
}

/** User display and locale preferences */
export interface UserPreferences {
  locale: string;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  emailNotifications: boolean;
}

/** A shipping address for checkout and order delivery */
export interface ShippingAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

/** A completed or pending order */
export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
}

/** A single search result with relevance score and highlight spans */
export interface SearchResult {
  product: Product;
  score: number;
  highlights: SearchHighlight[];
}

/** A highlighted span within a search result field */
export interface SearchHighlight {
  field: string;
  snippet: string;
  matchOffsets: Array<[number, number]>;
}

/** Paginated API response wrapper */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Filter parameters for product listing queries */
export interface ProductFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  status?: ProductStatus[];
  sortBy?: 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'relevance';
}
