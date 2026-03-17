/**
 * Product display card for the ShopFlow Web Store.
 *
 * Renders a product with image, title, price, rating stars, and an
 * add-to-cart button. Supports discount pricing with strikethrough
 * compare-at price and low-stock indicators.
 * @module components/ProductCard
 */

import React, { useCallback } from 'react';
import type { Product } from '@/types';

/** Props for the ProductCard component */
interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onNavigate: (productId: string) => void;
}

/**
 * Render a row of filled and empty star icons based on the rating.
 * Uses Unicode star characters for simplicity and accessibility.
 */
function RatingStars({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <div className="product-card__rating" aria-label={`Rated ${rating} out of 5`}>
      {'★'.repeat(fullStars)}
      {hasHalf && '½'}
      {'☆'.repeat(emptyStars)}
      <span className="product-card__review-count">({reviewCount})</span>
    </div>
  );
}

/**
 * Format a price in the product's currency with two decimal places.
 * Falls back to USD formatting if the currency is not recognized.
 */
function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

/**
 * ProductCard displays a single product in the catalog grid.
 * Clicking the card navigates to the product detail page.
 * The add-to-cart button is disabled when the product is out of stock.
 */
export const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart, onNavigate }) => {
  const isOutOfStock = product.status === 'out_of_stock';
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const primaryImage = product.images[0];

  const handleAddToCart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isOutOfStock) onAddToCart(product);
    },
    [product, onAddToCart, isOutOfStock]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onNavigate(product.id);
      }
    },
    [product.id, onNavigate]
  );

  return (
    <article
      className="product-card"
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(product.id)}
      onKeyDown={handleKeyDown}
      aria-label={`${product.title}, ${formatPrice(product.price, product.currency)}`}
    >
      <div className="product-card__image-wrapper">
        {primaryImage && (
          <img
            src={primaryImage.url}
            alt={primaryImage.alt}
            width={primaryImage.width}
            height={primaryImage.height}
            loading="lazy"
          />
        )}
        {product.status === 'low_stock' && (
          <span className="product-card__badge product-card__badge--low-stock">Low Stock</span>
        )}
        {hasDiscount && (
          <span className="product-card__badge product-card__badge--sale">Sale</span>
        )}
      </div>

      <div className="product-card__info">
        <h3 className="product-card__title">{product.title}</h3>
        <RatingStars rating={product.rating} reviewCount={product.reviewCount} />
        <div className="product-card__pricing">
          <span className="product-card__price">{formatPrice(product.price, product.currency)}</span>
          {hasDiscount && (
            <span className="product-card__compare-price">
              {formatPrice(product.compareAtPrice!, product.currency)}
            </span>
          )}
        </div>
      </div>

      <button
        className="product-card__add-to-cart"
        onClick={handleAddToCart}
        disabled={isOutOfStock}
        aria-label={isOutOfStock ? 'Out of stock' : `Add ${product.title} to cart`}
      >
        {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
      </button>
    </article>
  );
};
