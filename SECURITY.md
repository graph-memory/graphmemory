# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Use [GitHub Security Advisories](https://github.com/graphmemory/graphmemory/security/advisories/new) to report privately
3. Or email: **security@graphmemory.dev**

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

The following are in scope for security reports:

- Authentication bypass (JWT, API keys, MCP auth)
- Authorization bypass (access control, readonly mode)
- Injection vulnerabilities (path traversal, command injection)
- Data leakage (sensitive information in logs, responses)
- Denial of service (resource exhaustion, crash vectors)

## Security Architecture

See [docs/security.md](docs/security.md) and [docs/authentication.md](docs/authentication.md) for details on:

- Password hashing (scrypt)
- JWT token management (HS256, httpOnly cookies)
- API key authentication (timing-safe comparison)
- MCP endpoint authentication
- Per-graph access control (deny/r/rw)
- Readonly graph mode
