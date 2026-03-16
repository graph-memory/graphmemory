# Authentication API

## Endpoints

### Register

```http
POST /auth/register
```

**Request body:**

```json
{
  "email": "alice@example.com",
  "password": "securepassword123",
  "name": "Alice Johnson"
}
```

**Response:** `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com",
  "name": "Alice Johnson",
  "role": "member",
  "preferences": {
    "theme": "system",
    "locale": "en",
    "notifications": { "email": true, "push": true, "slack": false, "digest": "daily" },
    "timezone": "UTC"
  },
  "createdAt": 1710892800000,
  "updatedAt": 1710892800000
}
```

### Login

```http
POST /auth/login
```

**Request body:**

```json
{
  "email": "alice@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`

```json
{
  "accessToken": "at_550e8400_1710892800000_abc123",
  "refreshToken": "rt_550e8400_1710892800000_def456",
  "expiresAt": 1710893700000,
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Get Current User

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

**Response:** `200 OK` — returns user object

### Refresh Token

```http
POST /auth/refresh
```

**Request body:**

```json
{
  "refreshToken": "rt_550e8400_1710892800000_def456"
}
```

**Response:** `200 OK` — returns new token pair

### Logout

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

### Change Password

```http
POST /auth/change-password
Authorization: Bearer <accessToken>
```

**Request body:**

```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

**Response:** `200 OK`

**Note:** All active sessions are invalidated after a password change.

## Using Tokens

Include the access token in the `Authorization` header:

```http
GET /api/tasks
Authorization: Bearer at_550e8400_1710892800000_abc123
```

## Token Lifecycle

```
Register ──→ Login ──→ Use Access Token ──→ Token Expires ──→ Refresh ──→ Use New Token
                                                                └──→ Re-login if refresh fails
```

Access tokens expire after **15 minutes**. Refresh tokens expire after **7 days**.

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_CREDENTIALS | 401 | Wrong email or password |
| INVALID_TOKEN | 401 | Token is invalid or expired |
| INVALID_PASSWORD | 401 | Current password is incorrect |
| WEAK_PASSWORD | 400 | Password doesn't meet requirements |
| USER_NOT_FOUND | 404 | User account not found |
