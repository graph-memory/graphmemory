# Permissions and Role-Based Access Control

The ShopFlow Admin Panel uses a role-based access control (RBAC) system with three roles. Every authenticated user must have exactly one role assigned. Roles are stored in the central user database and enforced on both the client (UI visibility) and server (API authorization).

## Roles

### Admin

The `admin` role has unrestricted access to all features and settings. This role is intended for platform owners, CTOs, and senior operations leads.

Key capabilities:
- Full CRUD on all entities (orders, products, users)
- System configuration and feature flag management
- User role assignment (including promoting other users to admin)
- Access to all analytics and export features
- Audit log access

### Manager

The `manager` role covers day-to-day operations. Managers can handle orders, products, and analytics but cannot modify system configuration or manage admin-level users.

Key capabilities:
- Full CRUD on orders and products
- Read access to user list, limited write (cannot ban admins)
- Full analytics and export access
- Cannot modify system settings or feature flags
- Cannot promote users to admin role

### Support

The `support` role is designed for customer support agents who need to view orders and user information to resolve customer issues.

Key capabilities:
- Read-only access to orders, can update order status only
- Read-only access to user list and user activity logs
- No access to products, analytics, or exports
- Cannot modify user roles or ban/unban users
- Cannot access system settings

## Permission Matrix

| Action | Admin | Manager | Support |
|--------|:-----:|:-------:|:-------:|
| View dashboard | Yes | Yes | Yes |
| View orders | Yes | Yes | Yes |
| Create/edit orders | Yes | Yes | No |
| Update order status | Yes | Yes | Yes |
| Bulk order actions | Yes | Yes | No |
| View products | Yes | Yes | No |
| Create/edit products | Yes | Yes | No |
| Delete products | Yes | No | No |
| View users | Yes | Yes | Yes |
| Edit user roles | Yes | Limited | No |
| Ban/unban users | Yes | Yes | No |
| View user activity | Yes | Yes | Yes |
| View analytics | Yes | Yes | No |
| Export to CSV | Yes | Yes | No |
| System configuration | Yes | No | No |
| Feature flags | Yes | No | No |
| Audit logs | Yes | No | No |

## Two-Factor Authentication

2FA is implemented using TOTP (Time-based One-Time Password), compatible with standard authenticator apps (Google Authenticator, Authy, 1Password).

### Enforcement Policy

2FA enforcement is configurable per role:

| Setting | Default | Description |
|---------|---------|-------------|
| `2FA_REQUIRED_ADMIN` | `true` | Admins must have 2FA enabled |
| `2FA_REQUIRED_MANAGER` | `true` | Managers must have 2FA enabled |
| `2FA_REQUIRED_SUPPORT` | `false` | Support agents are encouraged but not required |

When 2FA is required for a role, users in that role who have not enabled 2FA will be redirected to the 2FA setup flow on login.

### Login Flow with 2FA

1. User submits email and password
2. Server validates credentials and checks if 2FA is enabled for the account
3. If 2FA is enabled, the server responds with a `2fa_required` status
4. Client prompts for the 6-digit TOTP code
5. User submits the code, server verifies it
6. On success, server issues the access token and refresh token

### Session Management

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Sessions are stored in `localStorage` and restored on page load
- Expired sessions trigger an `auth:expired` event that redirects to login
- The `AuthService` class handles token refresh automatically

## API Authorization

All API endpoints check the user's role before processing the request. The middleware extracts the role from the JWT token and compares it against the endpoint's required roles.

```typescript
// Example: only admin and manager can access product endpoints
router.use('/products', requireRoles(['admin', 'manager']));

// Example: all authenticated users can view orders
router.get('/orders', requireRoles(['admin', 'manager', 'support']));

// Example: only admin can modify system settings
router.use('/settings', requireRoles(['admin']));
```

Unauthorized requests receive a `403 Forbidden` response with a descriptive error message.

## Audit Trail

All role changes, bans, and permission-sensitive actions are logged to the audit trail with:

- Actor (who performed the action)
- Target (who was affected)
- Action type
- Timestamp
- IP address
- Previous and new values (for changes)

Only admins can view the audit trail through the admin panel UI.
