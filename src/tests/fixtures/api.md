# API Reference

REST API for the application. Base URL: `https://api.example.com/v1`.
All responses are JSON. See [auth](auth.md) for authentication details.

## Endpoints

### Users

- `GET /users` — list all users (admin only)
- `GET /users/:id` — get user by ID
- `POST /users` — create user
- `PUT /users/:id` — update user
- `DELETE /users/:id` — delete user (admin only)

### Sessions

- `POST /sessions` — login, returns `access_token` and `refresh_token`
- `DELETE /sessions` — logout, invalidates refresh token
- `POST /sessions/refresh` — exchange refresh token for new access token

## Error Codes

| Code | Meaning |
|------|---------|
| 400  | Bad Request — invalid input |
| 401  | Unauthorized — missing or invalid token |
| 403  | Forbidden — insufficient permissions |
| 404  | Not Found |
| 429  | Too Many Requests — rate limited |
| 500  | Internal Server Error |

## Rate Limiting

100 requests/min per IP for unauthenticated routes.
1000 requests/min per user for authenticated routes.
Retry-After header is set on 429 responses.
