import { useState } from 'react';
import { PAGE_SIZE } from './defaults.ts';

export { PAGE_SIZE, PAGE_SIZE_TABLE } from './defaults.ts';

export function usePagination(pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  return { page, setPage, total, setTotal, totalPages, offset, pageSize };
}
