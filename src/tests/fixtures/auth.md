# Auth Guide

Overview of authentication in the system. All API requests require a valid token.
See [api](api.md) for endpoint details.

## JWT Tokens

Access tokens are short-lived (15 min). Refresh tokens last 30 days.
Include the token in the `Authorization: Bearer <token>` header.

## Token Flow

1. User logs in with credentials → server returns `access_token` + `refresh_token`
2. Client stores both tokens securely (httpOnly cookie or secure storage)
3. On 401, use `refresh_token` to obtain a new `access_token`

## Roles

Three roles: `admin`, `editor`, `viewer`.
Permissions are checked per-endpoint. Role escalation requires re-authentication.
