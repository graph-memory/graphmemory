# Changelog

## [0.5.0] - 2026-03-15

### Added
- Webhook system with retry logic and signature verification
- Real-time notifications via EventBus
- Project statistics endpoint with task breakdown
- Rate limiting with token bucket and sliding window algorithms
- LRU cache with TTL and hit rate tracking

### Changed
- Task sorting now uses numeric priority order (critical=0, low=3)
- Improved error messages for validation failures

### Fixed
- Task `completedAt` not being cleared when reopening a task
- Race condition in concurrent task status updates

## [0.4.0] - 2026-03-01

### Added
- Task subtasks support (`parentId` field)
- Time tracking (`estimate`, `timeSpent`, `logTime()`)
- Task activity log with detailed change tracking
- Task search endpoint with full-text search
- Overdue tasks endpoint

### Changed
- Task list now supports filtering by multiple statuses
- Pagination limit increased from 50 to 100

## [0.3.0] - 2026-02-15

### Added
- Project workflow configuration (customizable kanban columns)
- WIP limits per column
- Auto-close stale tasks feature
- Project archive and restore
- Slug-based project routing

### Changed
- Project settings structure refactored for extensibility
- Default workflow now includes 6 columns

## [0.2.0] - 2026-02-01

### Added
- Team management (create, members, ownership transfer)
- Role-based access control (admin, manager, member, viewer)
- OAuth integration (Google, GitHub)
- Session management with concurrent session limits
- Password change with session invalidation

### Fixed
- Email validation accepting invalid formats
- Login not updating `lastLoginAt` timestamp

## [0.1.0] - 2026-01-15

### Added
- Initial release
- User registration and authentication (JWT)
- Project CRUD operations
- Task CRUD with status transitions
- Basic task filtering and sorting
- Structured logging
- Input validation utilities
- Configuration management via environment variables
