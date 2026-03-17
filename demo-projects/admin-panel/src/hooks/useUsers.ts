import { useState, useEffect, useCallback } from 'react';
import { AdminUser, AdminRole } from '@/types';
import { apiClient } from '@/services/api-client';

interface UseUsersReturn {
  users: AdminUser[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  roleFilter: AdminRole | undefined;
  setRoleFilter: (role: AdminRole | undefined) => void;
  loading: boolean;
  error: string | null;
  banUser: (userId: string) => Promise<void>;
  unbanUser: (userId: string) => Promise<void>;
  updateRole: (userId: string, role: AdminRole) => Promise<void>;
}

/** User list hook with search, role filtering, pagination, and user actions */
export function useUsers(pageSize = 25): UseUsersReturn {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminRole | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (roleFilter) params.set('role', roleFilter);

      const res = await apiClient.get<{ items: AdminUser[]; total: number }>(
        `/users?${params.toString()}`,
      );
      setUsers(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, roleFilter]);

  useEffect(() => {
    const debounce = setTimeout(fetchUsers, searchQuery ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [fetchUsers, searchQuery]);

  const banUser = useCallback(async (userId: string) => {
    await apiClient.post(`/users/${userId}/ban`);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isBanned: true } : u)),
    );
  }, []);

  const unbanUser = useCallback(async (userId: string) => {
    await apiClient.post(`/users/${userId}/unban`);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isBanned: false } : u)),
    );
  }, []);

  const updateRole = useCallback(async (userId: string, role: AdminRole) => {
    await apiClient.put(`/users/${userId}/role`, { role });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u)),
    );
  }, []);

  return {
    users,
    total,
    page,
    setPage,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    loading,
    error,
    banUser,
    unbanUser,
    updateRole,
  };
}
