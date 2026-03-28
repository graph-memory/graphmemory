/** Paginated result returned by all list operations. */
export interface PaginatedResult<T> {
  results: T[];
  total: number;
}
