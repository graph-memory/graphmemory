import React, { useCallback, useState } from 'react';
import { AdminUser, AdminRole } from '@/types';
import { useUsers } from '@/hooks/useUsers';
import { apiClient } from '@/services/api-client';

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  support: 'Support Agent',
};

interface ActivityLogEntry {
  id: string;
  action: string;
  timestamp: string;
  ipAddress: string;
}

/** User management panel: list users, assign roles, ban/unban, view activity */
export function UserManager() {
  const { users, total, loading, searchQuery, setSearchQuery, roleFilter, setRoleFilter, page, setPage } = useUsers();
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const handleRoleChange = useCallback(async (userId: string, newRole: AdminRole) => {
    try {
      await apiClient.put(`/users/${userId}/role`, { role: newRole });
    } catch (err) {
      console.error('Failed to update user role:', err);
    }
  }, []);

  const handleBanToggle = useCallback(async (user: AdminUser) => {
    const action = user.isBanned ? 'unban' : 'ban';
    if (!window.confirm(`Are you sure you want to ${action} ${user.displayName}?`)) return;
    try {
      await apiClient.post(`/users/${user.id}/${action}`);
    } catch (err) {
      console.error(`Failed to ${action} user:`, err);
    }
  }, []);

  const viewActivityLog = useCallback(async (user: AdminUser) => {
    setSelectedUser(user);
    setLoadingLog(true);
    try {
      const log = await apiClient.get<ActivityLogEntry[]>(`/users/${user.id}/activity?limit=50`);
      setActivityLog(log);
    } catch (err) {
      console.error('Failed to load activity log:', err);
    } finally {
      setLoadingLog(false);
    }
  }, []);

  return (
    <div className="user-manager">
      <h2>User Management</h2>
      <div className="user-manager__filters">
        <input type="search" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <select value={roleFilter ?? ''} onChange={(e) => setRoleFilter((e.target.value as AdminRole) || undefined)}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      {loading ? <p>Loading users...</p> : (
        <table className="user-manager__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>2FA</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((user: AdminUser) => (
              <tr key={user.id} className={user.isBanned ? 'user--banned' : ''}>
                <td>{user.displayName}</td>
                <td>{user.email}</td>
                <td>
                  <select value={user.role} onChange={(e) => handleRoleChange(user.id, e.target.value as AdminRole)}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td>{user.twoFactorEnabled ? 'Enabled' : 'Disabled'}</td>
                <td>{user.isBanned ? 'Banned' : 'Active'}</td>
                <td>
                  <button onClick={() => handleBanToggle(user)}>{user.isBanned ? 'Unban' : 'Ban'}</button>
                  <button onClick={() => viewActivityLog(user)}>Activity</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedUser && (
        <div className="user-manager__activity-panel">
          <h3>Activity Log: {selectedUser.displayName}</h3>
          <button onClick={() => setSelectedUser(null)}>Close</button>
          {loadingLog ? <p>Loading...</p> : (
            <ul>{activityLog.map((entry) => (
              <li key={entry.id}>{entry.action} — {entry.ipAddress} — {new Date(entry.timestamp).toLocaleString()}</li>
            ))}</ul>
          )}
        </div>
      )}
    </div>
  );
}
