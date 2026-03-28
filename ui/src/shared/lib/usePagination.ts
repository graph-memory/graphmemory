import { useState } from 'react';

export const PAGE_SIZE = 25;
export const PAGE_SIZE_TABLE = 50;

export function usePagination(pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  return { page, setPage, total, setTotal, totalPages, offset, pageSize };
}
