# Code Examples

Overview of code patterns used in the project.

## Authentication

Here is how to create a JWT token:

```typescript
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  role: string;
}

function createToken(payload: TokenPayload): string {
  return jwt.sign(payload, process.env.SECRET!, { expiresIn: '15m' });
}

function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.SECRET!) as TokenPayload;
}
```

And here is the middleware:

```typescript
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  req.user = verifyToken(token);
  next();
}
```

## Database

Setting up the database connection:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}
```

## Configuration

Example YAML config (not parsed by AST):

```yaml
server:
  port: 3000
  host: localhost
database:
  url: postgres://localhost/mydb
```

An untagged code block:

```
just some plain text
in a code fence
without a language tag
```

## API Client

```typescript
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    return res.json() as Promise<T>;
  }
}

const defaultClient = new ApiClient('https://api.example.com');
```
