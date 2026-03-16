# TaskFlow Documentation

Welcome to the TaskFlow documentation. TaskFlow is a modern project management API built with TypeScript.

## Quick Links

### Getting Started
- [Getting Started Guide](guides/getting-started.md) — installation, configuration, first steps
- [Deployment Guide](guides/deployment.md) — Docker, Kubernetes, cloud providers

### API Reference
- [Authentication](api/auth.md) — register, login, tokens
- [Tasks](api/tasks.md) — task CRUD, status transitions, search
- [Projects](api/projects.md) — project management, stats, workflow
- [Webhooks](api/webhooks.md) — real-time event notifications

### Architecture
- [Overview](architecture/overview.md) — system layers, data flow, design decisions
- [Data Model](architecture/data-model.md) — entities, relationships, indexes
- [Authentication](architecture/authentication.md) — auth flow, roles, security

### Contributing
- [Contributing Guide](guides/contributing.md) — development setup, code style, PR process
- [Testing Guide](guides/testing.md) — test strategy, writing tests, coverage

### Release Notes
- [Changelog](CHANGELOG.md) — version history and changes

## Features

- Multi-team workspaces with role-based access
- Customizable kanban workflows with WIP limits
- Task tracking with subtasks, time logging, and activity history
- Full-text search across tasks and projects
- Webhook integrations with retry and circuit breaking
- OAuth support (Google, GitHub)
- Structured logging and monitoring
- RESTful API with comprehensive validation

## Support

- GitHub Issues: Report bugs and request features
- Discussions: Ask questions and share ideas
