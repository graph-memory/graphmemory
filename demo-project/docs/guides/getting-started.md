# Getting Started

## Prerequisites

- Node.js 20 or later
- PostgreSQL 15 or later
- Redis 7 or later (optional, for caching)

## Installation

```bash
git clone https://github.com/taskflow/taskflow-api.git
cd taskflow-api
npm install
```

## Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Server
PORT=3000
HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskflow
DB_USER=taskflow
DB_PASSWORD=your-password

# Auth
JWT_SECRET=generate-a-secure-random-string
```

See [Configuration Reference](../architecture/overview.md) for all available options.

## Database Setup

Create the database and run migrations:

```bash
createdb taskflow
npm run migrate
```

## Running

### Development

```bash
npm run dev
```

This starts the server with hot reload on port 3000.

### Production

```bash
npm run build
NODE_ENV=production node dist/index.js
```

## Quick Start Tutorial

### 1. Register a User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "alice@example.com",
    "password": "securepassword123",
    "name": "Alice Johnson"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "alice@example.com",
    "password": "securepassword123"
  }'
```

Save the `accessToken` from the response.

### 3. Create a Project

```bash
curl -X POST http://localhost:3000/api/teams/{teamId}/projects \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My First Project",
    "description": "Getting started with TaskFlow"
  }'
```

### 4. Create a Task

```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/tasks \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Set up CI/CD pipeline",
    "description": "Configure GitHub Actions for automated testing and deployment",
    "priority": "high",
    "type": "chore",
    "tags": ["devops", "ci"]
  }'
```

### 5. Move Task to In Progress

```bash
curl -X POST http://localhost:3000/api/tasks/{taskId}/move \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{"status": "in_progress"}'
```

## Next Steps

- Read the [API documentation](../api/tasks.md)
- Learn about [authentication](../architecture/authentication.md)
- Set up [webhooks](../api/webhooks.md) for integrations
- Review the [architecture overview](../architecture/overview.md)
