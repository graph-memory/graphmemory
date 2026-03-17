/**
 * Review controller — HTTP handlers for product reviews and ratings.
 * Manages the review lifecycle: submission, moderation, listing, and
 * rating aggregation for product pages.
 *
 * Routes:
 *   GET    /api/products/:productId/reviews     — List reviews for a product
 *   GET    /api/products/:productId/ratings      — Get rating aggregation
 *   POST   /api/products/:productId/reviews     — Submit a new review
 *   PATCH  /api/reviews/:id/moderate            — Approve or reject a review
 *
 * @see {@link ../models/review.ts} for Review model and validation
 * @see {@link ../../docs/api-reference.md} for full API documentation
 */

import { Request, Response } from 'express';
import { Review, RatingAggregation } from '@/types';
import { createReview, validateReviewInput, aggregateRatings, CreateReviewInput } from '@/models/review';

/** In-memory review store (replaced by database in production) */
const reviews: Map<string, Review> = new Map();

/**
 * List reviews for a specific product. Supports filtering by status
 * and sorting by date or rating.
 *
 * Query params: status (pending|approved|rejected), sortBy (date|rating), limit, offset
 */
export function handleListReviews(req: Request, res: Response): void {
  const productId = req.params.productId;
  const status = req.query.status as Review['status'] | undefined;
  const sortBy = (req.query.sortBy as string) ?? 'date';

  let productReviews = Array.from(reviews.values())
    .filter(r => r.productId === productId);

  if (status) {
    productReviews = productReviews.filter(r => r.status === status);
  }

  if (sortBy === 'rating') {
    productReviews.sort((a, b) => b.rating - a.rating);
  } else {
    productReviews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 20);
  const paginated = productReviews.slice(offset, offset + limit);

  res.json({
    reviews: paginated,
    totalCount: productReviews.length,
    hasMore: offset + limit < productReviews.length,
  });
}

/**
 * Get the rating aggregation for a product — average, count, and distribution.
 * Only includes approved reviews in the calculation.
 */
export function handleGetRatings(req: Request, res: Response): void {
  const productId = req.params.productId;
  const productReviews = Array.from(reviews.values())
    .filter(r => r.productId === productId);

  const aggregation: RatingAggregation = aggregateRatings(productReviews);
  res.json(aggregation);
}

/**
 * Submit a new review. Validates input fields and creates the review
 * in pending moderation status. Returns 400 for validation errors.
 */
export function handleCreateReview(req: Request, res: Response): void {
  const input: CreateReviewInput = {
    ...req.body,
    productId: req.params.productId,
  };

  const errors = validateReviewInput(input);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const review = createReview(input);
  reviews.set(review.id, review);
  res.status(201).json(review);
}

/**
 * Moderate a review — approve or reject. Only pending reviews can be moderated.
 * Body: { status: 'approved' | 'rejected' }
 */
export function handleModerateReview(req: Request, res: Response): void {
  const review = reviews.get(req.params.id);
  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }

  if (review.status !== 'pending') {
    res.status(400).json({ error: `Cannot moderate a review with status: ${review.status}` });
    return;
  }

  const newStatus = req.body.status as 'approved' | 'rejected';
  if (newStatus !== 'approved' && newStatus !== 'rejected') {
    res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
    return;
  }

  const updated: Review = { ...review, status: newStatus };
  reviews.set(review.id, updated);
  res.json(updated);
}
