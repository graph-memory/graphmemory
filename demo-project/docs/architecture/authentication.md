# Authentication & Authorization

## Authentication Flow

### Registration

1. Client sends `POST /auth/register` with email, password, and name
2. Server validates input (email format, password strength)
3. Server checks for existing user with same email
4. Password is hashed with bcrypt (12 rounds default)
5. User record is created with `member` role
6. Registration event is emitted for welcome email

### Login

1. Client sends `POST /auth/login` with email and password
2. Server looks up user by email
3. Server verifies password hash
4. If max sessions exceeded, old sessions are cleared
5. New session is created with access + refresh tokens
6. Last login timestamp is updated

### Token Refresh

1. Client sends `POST /auth/refresh` with refresh token
2. Server validates refresh token exists and is not expired
3. Old session is deleted
4. New access + refresh token pair is generated

### Logout

1. Client sends `POST /auth/logout` with bearer token
2. Server deletes the session

## Token Structure

```typescript
interface AuthToken {
  accessToken: string     // Short-lived (15 minutes)
  refreshToken: string    // Long-lived (7 days)
  expiresAt: Timestamp    // Access token expiry
  userId: UUID
}
```

## Authorization Model

### Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| admin | Full access | All operations |
| manager | Team management | Create/archive projects, manage members |
| member | Standard user | Create/edit tasks, comment |
| viewer | Read-only | View tasks and projects |

### Middleware Chain

```typescript
// Public route
app.post('/auth/login', authController.login)

// Authenticated route
app.get('/tasks', authRequired(), taskController.list)

// Role-restricted route
app.post('/projects', roleRequired('admin', 'manager'), projectController.create)

// Project-scoped route
app.put('/tasks/:id', authRequired(), projectAccess(ctx => ctx.params.projectId), taskController.update)
```

## Security Measures

### Password Policy

- Minimum 8 characters
- Bcrypt hashing with configurable rounds (default: 12)
- Password change requires current password verification
- All sessions invalidated on password change

### Session Management

- Maximum concurrent sessions per user (default: 5)
- Sessions stored server-side with expiry
- Automatic cleanup of expired sessions
- IP and user-agent tracked per session

### Rate Limiting

Authentication endpoints have stricter rate limits:

| Endpoint | Rate Limit |
|----------|------------|
| POST /auth/login | 5 per minute per IP |
| POST /auth/register | 3 per minute per IP |
| POST /auth/refresh | 10 per minute per user |
| Other endpoints | 100 per minute per user |

### OAuth Integration

Supported providers:
- **Google** — via OAuth 2.0 authorization code flow
- **GitHub** — via OAuth 2.0 authorization code flow

OAuth users are created with a generated password and can set one later. OAuth sessions follow the same token lifecycle as password-based sessions.

## Configuration

See [config/index.ts](../../src/config/index.ts) for all auth-related environment variables:

```env
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
MAX_SESSIONS=5
PASSWORD_MIN_LENGTH=8
MFA_ENABLED=false
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```
